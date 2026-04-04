# Production-Grade OMR Detection Stack

This module provides a full React + FastAPI + OpenCV OMR pipeline, with Docker deployment.

## Features
- Adaptive thresholding, blur checking, CLAHE normalization
- Sheet contour detection + perspective transform
- Bubble contour filtering (size + circularity + aspect ratio)
- Dynamic fill threshold with invalid multi-mark handling
- JSON output with confidence score
- Visual overlay for debugging

## Run with Docker
```bash
cd omr-system
docker compose up --build
```
- Frontend: http://localhost:5173
- Backend: http://localhost:8000

## Local backend run
```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload
```

## API
`POST /upload-omr`
- multipart form-data:
  - `image`: file
  - `questions`: int (default 50)
  - `options_per_question`: int (default 4)

Response:
```json
{
  "answers": {"1": "A"},
  "invalid_questions": [3],
  "confidence_score": 0.98,
  "warnings": [],
  "processing_time_ms": 800,
  "debug_overlay_base64": "..."
}
```

## Validation script
```bash
python scripts/validate_omr.py --api http://localhost:8000 --dir test_images
```
