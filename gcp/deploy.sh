#!/usr/bin/env bash
# Cloud SDK Shell / local gcloud — SimpleLocate GCP deploy
# Usage:
#   export PROJECT_ID="your-gcp-project"
#   export REGION="europe-west1"
#   bash gcp/deploy.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PROJECT_ID="${PROJECT_ID:?Set PROJECT_ID}"
REGION="${REGION:-europe-west1}"
SQL_INSTANCE="${SQL_INSTANCE:-simple-locate-db}"
DB_NAME="${DB_NAME:-simple_locate}"
DB_USER="${DB_USER:-locate_app}"
BUCKET="${BUCKET:-${PROJECT_ID}-simple-locate}"
FN_NAME="${FN_NAME:-logs-api}"

echo "==> Project: $PROJECT_ID  Region: $REGION"
gcloud config set project "$PROJECT_ID"

echo "==> Enable APIs"
gcloud services enable \
  sqladmin.googleapis.com \
  secretmanager.googleapis.com \
  cloudfunctions.googleapis.com \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  storage.googleapis.com \
  compute.googleapis.com

# ---- Cloud SQL ----
if ! gcloud sql instances describe "$SQL_INSTANCE" >/dev/null 2>&1; then
  echo "==> Create Cloud SQL instance $SQL_INSTANCE (takes several minutes)"
  DB_PASS="${DB_PASS:-$(openssl rand -base64 24)}"
  gcloud sql instances create "$SQL_INSTANCE" \
    --database-version=POSTGRES_15 \
    --tier=db-f1-micro \
    --region="$REGION" \
    --storage-size=10 \
    --storage-auto-increase
  gcloud sql databases create "$DB_NAME" --instance="$SQL_INSTANCE" || true
  gcloud sql users create "$DB_USER" --instance="$SQL_INSTANCE" --password="$DB_PASS"
  echo "SAVE THIS DB PASSWORD: $DB_PASS"
else
  echo "==> Cloud SQL instance exists"
  DB_PASS="${DB_PASS:-}"
  if [[ -z "$DB_PASS" ]]; then
    echo "Existing instance — set DB_PASS env if recreating secrets, or skip secret recreate."
  fi
fi

SQL_CONN="$(gcloud sql instances describe "$SQL_INSTANCE" --format='value(connectionName)')"
echo "SQL connection: $SQL_CONN"

echo "==> Apply schema (interactive password for postgres user may be required)"
echo "    Run manually if needed:"
echo "    gcloud sql connect $SQL_INSTANCE --user=postgres --database=$DB_NAME"
echo "    then paste gcp/schema.sql"

# ---- Secrets ----
API_KEY="${API_KEY:-$(openssl rand -hex 24)}"
if [[ -n "${DB_PASS:-}" ]]; then
  DATABASE_URL="postgresql://${DB_USER}:${DB_PASS}@/${DB_NAME}?host=/cloudsql/${SQL_CONN}"
  if gcloud secrets describe locate-database-url >/dev/null 2>&1; then
    echo -n "$DATABASE_URL" | gcloud secrets versions add locate-database-url --data-file=-
  else
    echo -n "$DATABASE_URL" | gcloud secrets create locate-database-url --data-file=-
  fi
fi

if gcloud secrets describe locate-api-key >/dev/null 2>&1; then
  echo -n "$API_KEY" | gcloud secrets versions add locate-api-key --data-file=-
else
  echo -n "$API_KEY" | gcloud secrets create locate-api-key --data-file=-
fi
echo "CLIENT x-api-key: $API_KEY"

# Grant Cloud Functions SA access to secrets
PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
CF_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
gcloud secrets add-iam-policy-binding locate-database-url \
  --member="serviceAccount:${CF_SA}" --role="roles/secretmanager.secretAccessor" >/dev/null || true
gcloud secrets add-iam-policy-binding locate-api-key \
  --member="serviceAccount:${CF_SA}" --role="roles/secretmanager.secretAccessor" >/dev/null || true

# Cloud SQL Client role
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${CF_SA}" \
  --role="roles/cloudsql.client" >/dev/null || true

# ---- Function ----
echo "==> Deploy Cloud Function $FN_NAME"
gcloud functions deploy "$FN_NAME" \
  --gen2 \
  --runtime=nodejs20 \
  --region="$REGION" \
  --source="$ROOT/gcp/logs-api" \
  --entry-point=logsApi \
  --trigger-http \
  --allow-unauthenticated \
  --set-secrets="DATABASE_URL=locate-database-url:latest,API_KEY=locate-api-key:latest" \
  --set-env-vars="CORS_ORIGIN=*" \
  --memory=256Mi \
  --timeout=60s

# Gen2 = Cloud Run: Cloud SQL bağlantısını Run üzerinden ekle
gcloud run services update "$FN_NAME" \
  --region="$REGION" \
  --add-cloudsql-instances="$SQL_CONN" \
  --quiet || true

FN_URL="$(gcloud functions describe "$FN_NAME" --gen2 --region="$REGION" --format='value(serviceConfig.uri)')"
echo "FUNCTION_URL=$FN_URL"

# ---- Static bucket ----
echo "==> Static site bucket gs://$BUCKET"
if ! gcloud storage buckets describe "gs://${BUCKET}" >/dev/null 2>&1; then
  gcloud storage buckets create "gs://${BUCKET}" --location="$REGION"
fi
gcloud storage buckets update "gs://${BUCKET}" --web-main-page-suffix=index.html --web-error-page=index.html || true

# Upload site files (exclude node_modules, git, source tooling)
gcloud storage rsync "$ROOT" "gs://${BUCKET}" --recursive \
  --exclude="(.*[\\/])?(\\.git|node_modules|src|gcp|dist[\\/].*\\.map)([\\/].*)?"

# Make objects public-read (website)
gcloud storage buckets add-iam-policy-binding "gs://${BUCKET}" \
  --member=allUsers \
  --role=roles/storage.objectViewer || true

echo ""
echo "========== DONE =========="
echo "Site:     https://storage.googleapis.com/${BUCKET}/index.html"
echo "Viewer:   https://storage.googleapis.com/${BUCKET}/log-viewer.html"
echo "API URL:  $FN_URL"
echo "API KEY:  $API_KEY"
echo ""
echo "Update index.html panelOptions.autoUpload:"
echo "  url: '$FN_URL'"
echo "  apiKey: '$API_KEY'"
echo "Then re-run rsync or edit in Console."
echo "=========================="
