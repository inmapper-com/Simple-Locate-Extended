# GCP — SimpleLocate (Cloud SDK Shell)

Supabase / Netlify yok. Tek Google Cloud projesi:

1. **Cloud Storage** — static site  
2. **Cloud Functions Gen2** — `logs-api` (POST/GET)  
3. **Cloud SQL Postgres** — `test_logs`  
4. **Secret Manager** — DB URL + API key  

## Cloud Shell adımları

```bash
git clone <YOUR_REPO_URL> inmapper-simpe-locate-extended
cd inmapper-simpe-locate-extended
npm install && npm run build

export PROJECT_ID="tubitak-1507-2025"
export REGION="europe-west1"
bash gcp/deploy.sh
```

### Şema (ilk sefer)

```bash
gcloud sql connect simple-locate-db --user=postgres --database=simple_locate
```

`gcp/schema.sql` içeriğini yapıştır.

### Client config

Deploy çıktısındaki URL + API key:

`index.html` → `panelOptions.autoUpload.url` / `apiKey`

```bash
gcloud storage cp index.html log-viewer.html "gs://${PROJECT_ID}-simple-locate/"
```

### Test

```bash
curl -X POST "$FUNCTION_URL" \
  -H "Content-Type: application/json" \
  -H "x-api-key: $API_KEY" \
  -d '{"session_id":"t1","label":"test","entry_count":1,"compressed":false,"payload":"{\"entries\":[]}"}'

curl "$FUNCTION_URL?limit=5" -H "x-api-key: $API_KEY"
```

## Otomatik güncelleme (GitHub push)

`cloudbuild.yaml` + `gcp/setup-cloudbuild-trigger.sh`

1. İlk kurulum: `bash gcp/deploy.sh` (SQL + secrets)
2. GitHub’ı Cloud Build’e bağla (Console → Repositories)
3. `bash gcp/setup-cloudbuild-trigger.sh`
4. Bundan sonra `main` push → site + Function otomatik deploy

Manuel:

```bash
gcloud builds submit --config=cloudbuild.yaml --project=tubitak-1507-2025
```

## Console karşılıkları

| İhtiyaç | Console menü |
|---------|----------------|
| SQL instance | SQL → Instances |
| Function URL | Cloud Functions → logs-api |
| Secrets | Secret Manager |
| Site files | Cloud Storage → bucket |
