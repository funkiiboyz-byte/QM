import base64
import logging
import time
from dataclasses import dataclass

import cv2
import numpy as np

logger = logging.getLogger("omr")


@dataclass
class OMRConfig:
    questions: int = 50
    options_per_question: int = 4
    min_blur_score: float = 80.0


class OMRProcessingError(Exception):
    pass


def _order_points(pts: np.ndarray) -> np.ndarray:
    rect = np.zeros((4, 2), dtype="float32")
    s = pts.sum(axis=1)
    rect[0] = pts[np.argmin(s)]
    rect[2] = pts[np.argmax(s)]
    d = np.diff(pts, axis=1)
    rect[1] = pts[np.argmin(d)]
    rect[3] = pts[np.argmax(d)]
    return rect


def _four_point_transform(image: np.ndarray, pts: np.ndarray) -> np.ndarray:
    rect = _order_points(pts)
    (tl, tr, br, bl) = rect
    width_a = np.linalg.norm(br - bl)
    width_b = np.linalg.norm(tr - tl)
    max_width = int(max(width_a, width_b))
    height_a = np.linalg.norm(tr - br)
    height_b = np.linalg.norm(tl - bl)
    max_height = int(max(height_a, height_b))
    dst = np.array(
        [[0, 0], [max_width - 1, 0], [max_width - 1, max_height - 1], [0, max_height - 1]],
        dtype="float32",
    )
    m = cv2.getPerspectiveTransform(rect, dst)
    return cv2.warpPerspective(image, m, (max_width, max_height))


def _encode_overlay(img: np.ndarray) -> str:
    ok, buf = cv2.imencode(".jpg", img, [int(cv2.IMWRITE_JPEG_QUALITY), 85])
    if not ok:
        return ""
    return base64.b64encode(buf.tobytes()).decode("utf-8")


def _find_sheet_contour(gray: np.ndarray) -> np.ndarray | None:
    blur = cv2.GaussianBlur(gray, (5, 5), 0)
    edges = cv2.Canny(blur, 60, 170)
    contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    contours = sorted(contours, key=cv2.contourArea, reverse=True)[:10]

    for contour in contours:
        peri = cv2.arcLength(contour, True)
        approx = cv2.approxPolyDP(contour, 0.02 * peri, True)
        if len(approx) == 4 and cv2.contourArea(approx) > gray.size * 0.08:
            return approx.reshape(4, 2).astype("float32")

    if contours:
        rect = cv2.minAreaRect(contours[0])
        box = cv2.boxPoints(rect)
        if cv2.contourArea(box.astype(np.float32)) > gray.size * 0.08:
            return box.astype("float32")
    return None


def _group_rows(candidates: list[dict], y_tolerance: float) -> list[list[dict]]:
    rows: list[list[dict]] = []
    for item in sorted(candidates, key=lambda x: x["center"][1]):
        if not rows:
            rows.append([item])
            continue
        mean_y = np.mean([it["center"][1] for it in rows[-1]])
        if abs(item["center"][1] - mean_y) <= y_tolerance:
            rows[-1].append(item)
        else:
            rows.append([item])
    return [sorted(row, key=lambda x: x["center"][0]) for row in rows]


def process_omr(image_bytes: bytes, config: OMRConfig) -> dict:
    started = time.time()
    warnings: list[str] = []

    arr = np.frombuffer(image_bytes, dtype=np.uint8)
    image = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if image is None:
        raise OMRProcessingError("Invalid image data")

    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    blur_score = cv2.Laplacian(gray, cv2.CV_64F).var()
    if blur_score < config.min_blur_score:
        warnings.append("Image looks blurry; detection confidence may be lower.")

    sheet = _find_sheet_contour(gray)
    if sheet is None:
        raise OMRProcessingError("Sheet not detected. Try a clearer image with full page visible.")

    warped = _four_point_transform(image, sheet)
    warped_gray = cv2.cvtColor(warped, cv2.COLOR_BGR2GRAY)

    # Lighting normalization + denoise
    clahe = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(8, 8))
    normalized = clahe.apply(warped_gray)
    blur = cv2.GaussianBlur(normalized, (5, 5), 0)

    # Adaptive threshold + morphology
    thresh = cv2.adaptiveThreshold(
        blur,
        255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY_INV,
        35,
        7,
    )
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    cleaned = cv2.morphologyEx(thresh, cv2.MORPH_OPEN, kernel, iterations=1)
    cleaned = cv2.morphologyEx(cleaned, cv2.MORPH_CLOSE, kernel, iterations=1)

    contours, _ = cv2.findContours(cleaned, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
    bubble_candidates: list[dict] = []

    for c in contours:
        area = cv2.contourArea(c)
        if area < 40 or area > 2500:
            continue
        peri = cv2.arcLength(c, True)
        if peri == 0:
            continue
        circularity = (4 * np.pi * area) / (peri * peri)
        x, y, w, h = cv2.boundingRect(c)
        aspect_ratio = w / float(h)
        if 0.65 <= aspect_ratio <= 1.35 and circularity > 0.45:
            bubble_candidates.append(
                {
                    "contour": c,
                    "bbox": (x, y, w, h),
                    "center": (x + w / 2, y + h / 2),
                    "area": area,
                }
            )

    if len(bubble_candidates) < config.questions * config.options_per_question * 0.6:
        raise OMRProcessingError("Bubble detection mismatch. Ensure proper OMR format and full-page scan.")

    diameters = [max(item["bbox"][2], item["bbox"][3]) for item in bubble_candidates]
    y_tol = max(8.0, float(np.median(diameters) * 0.9))
    rows = _group_rows(bubble_candidates, y_tol)

    # Keep rows that look like question rows
    rows = [r for r in rows if len(r) >= config.options_per_question]
    rows = rows[: config.questions]

    if len(rows) < config.questions * 0.8:
        raise OMRProcessingError("Question row mismatch. Re-capture image with straight alignment.")

    option_labels = [chr(ord("A") + i) for i in range(config.options_per_question)]
    answers: dict[str, str] = {}
    invalid_questions: list[int] = []
    confidence_chunks: list[float] = []

    overlay = warped.copy()

    for q_idx, row in enumerate(rows, start=1):
        row = row[: config.options_per_question]
        fill_scores: list[float] = []

        for item in row:
            x, y, w, h = item["bbox"]
            roi = cleaned[y : y + h, x : x + w]
            mask = np.zeros_like(roi)
            cv2.circle(mask, (w // 2, h // 2), int(min(w, h) * 0.35), 255, -1)
            active = cv2.countNonZero(cv2.bitwise_and(roi, mask))
            norm = active / max(1, cv2.countNonZero(mask))
            fill_scores.append(norm)

        fill_np = np.array(fill_scores, dtype=np.float32)
        best_idx = int(np.argmax(fill_np))
        mean_score = float(np.mean(fill_np))
        std_score = float(np.std(fill_np))

        dynamic_threshold = mean_score + max(0.08, std_score * 1.2)
        marked = np.where(fill_np >= dynamic_threshold)[0].tolist()

        if len(marked) != 1:
            invalid_questions.append(q_idx)
            answers[str(q_idx)] = "INVALID"
            color = (0, 0, 255)
        else:
            answers[str(q_idx)] = option_labels[marked[0]]
            color = (0, 255, 0)
            confidence_chunks.append(float(fill_np[marked[0]] - mean_score))

        for idx, item in enumerate(row):
            x, y, w, h = item["bbox"]
            is_marked = idx in marked
            draw_color = color if is_marked else (180, 180, 180)
            cv2.rectangle(overlay, (x, y), (x + w, y + h), draw_color, 2)

        cv2.putText(
            overlay,
            f"Q{q_idx}: {answers[str(q_idx)]}",
            (row[0]["bbox"][0] - 55, row[0]["bbox"][1] + 12),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.45,
            color,
            1,
            cv2.LINE_AA,
        )

    confidence = 0.0
    if confidence_chunks:
        confidence = float(np.clip(np.mean(confidence_chunks) * 2.2, 0.0, 1.0))

    elapsed_ms = int((time.time() - started) * 1000)
    logger.info("OMR processed in %sms (blur=%.2f, rows=%s)", elapsed_ms, blur_score, len(rows))

    return {
        "answers": answers,
        "invalid_questions": invalid_questions,
        "confidence_score": round(confidence, 4),
        "warnings": warnings,
        "processing_time_ms": elapsed_ms,
        "debug_overlay_base64": _encode_overlay(overlay),
    }
