# PuzzleTracker

## UI Terminology

- **Piece placing screen**: The active session view (`#session-view` in `static/index.html`, handled by session-related functions in `static/app.js`). This is where users track puzzle piece placements during a session. Key elements:
  - Session timer and pause button
  - "Time holding piece" and "Last piece" timers
  - Placed/Failed counters with scope toggle (Project vs This Sitting)
  - Pick Piece → Placed/Failed workflow buttons
  - Undo button
  - Progression graph showing time per piece

## Deployment

- **Trigger**: Push to `main` branch on GitHub
- **Pipeline**: Cloud Build (`cloudbuild.yaml`) → Cloud Run
- **Region**: us-central1
- **Project**: `my-dl-1224`
- **Note**: Cannot use `gcloud builds submit` directly - the config uses `$COMMIT_SHA` which is only available via GitHub trigger

### Deploy and Wait for Completion

```bash
# Push to trigger deployment
git push origin main

# Check build status (wait for SUCCESS)
gcloud builds list --limit=1 --project=my-dl-1224 --format="table(id,status,createTime)"
```

### Required IAM Permissions

Cloud Build service account (`<project-number>@cloudbuild.gserviceaccount.com`) needs:
- `roles/run.admin` on the project
- `roles/iam.serviceAccountUser` on the compute service account

## Database (GCS)

- **Bucket**: `gs://puzzle-tracker-data-my-dl-1224/`
- **File**: `puzzle-tracker-data.json`

### Read Database

```bash
gsutil cat gs://puzzle-tracker-data-my-dl-1224/puzzle-tracker-data.json
```

### Edit Database

```bash
# Download, edit locally, then upload
gsutil cp gs://puzzle-tracker-data-my-dl-1224/puzzle-tracker-data.json /tmp/claude/puzzle-data.json
# ... edit /tmp/claude/puzzle-data.json ...
gsutil cp /tmp/claude/puzzle-data.json gs://puzzle-tracker-data-my-dl-1224/puzzle-tracker-data.json
```
