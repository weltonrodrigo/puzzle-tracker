# PuzzleTracker

## Deployment

- **Trigger**: Push to `main` branch on GitHub
- **Pipeline**: Cloud Build (`cloudbuild.yaml`) → Cloud Run
- **Region**: us-central1
- **Note**: Cannot use `gcloud builds submit` directly - the config uses `$COMMIT_SHA` which is only available via GitHub trigger

### Required IAM Permissions

Cloud Build service account (`<project-number>@cloudbuild.gserviceaccount.com`) needs:
- `roles/run.admin` on the project
- `roles/iam.serviceAccountUser` on the compute service account
