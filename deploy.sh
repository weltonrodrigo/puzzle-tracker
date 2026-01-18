#!/bin/bash
set -e

# Configuration
PROJECT_ID="${GCP_PROJECT_ID:-your-project-id}"
REGION="${GCP_REGION:-us-central1}"
SERVICE_NAME="puzzle-tracker"
BUCKET_NAME="puzzle-tracker-data-${PROJECT_ID}"

echo "=== PuzzleTracker Deployment ==="
echo "Project: $PROJECT_ID"
echo "Region: $REGION"
echo ""

# Check if gcloud is configured
if ! gcloud config get-value project &> /dev/null; then
    echo "Error: gcloud is not configured. Run: gcloud init"
    exit 1
fi

# Set project
gcloud config set project "$PROJECT_ID"

# Step 1: Create GCS bucket for data storage (if not exists)
echo "Step 1: Creating GCS bucket..."
if ! gsutil ls "gs://$BUCKET_NAME" &> /dev/null; then
    gsutil mb -l "$REGION" "gs://$BUCKET_NAME"
    echo "Bucket created: $BUCKET_NAME"
else
    echo "Bucket already exists: $BUCKET_NAME"
fi

# Step 2: Build and push Docker image using Cloud Build
echo ""
echo "Step 2: Building container image..."
gcloud builds submit --tag "gcr.io/$PROJECT_ID/$SERVICE_NAME"

# Step 3: Deploy to Cloud Run
echo ""
echo "Step 3: Deploying to Cloud Run..."
gcloud run deploy "$SERVICE_NAME" \
    --image "gcr.io/$PROJECT_ID/$SERVICE_NAME" \
    --platform managed \
    --region "$REGION" \
    --allow-unauthenticated \
    --memory 256Mi \
    --min-instances 0 \
    --max-instances 1 \
    --set-env-vars "GCS_BUCKET=$BUCKET_NAME,USE_LOCAL_STORAGE=false"

# Step 4: Get the service URL
echo ""
echo "Step 4: Getting service URL..."
SERVICE_URL=$(gcloud run services describe "$SERVICE_NAME" --platform managed --region "$REGION" --format 'value(status.url)')

echo ""
echo "=== Deployment Complete ==="
echo "Your PuzzleTracker is live at:"
echo "$SERVICE_URL"
echo ""
echo "To view logs:"
echo "gcloud run logs read --service $SERVICE_NAME --region $REGION"
