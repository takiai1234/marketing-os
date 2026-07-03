-- Migration 052: Trim whitespace khỏi page_path trong landing_page
UPDATE landing_page SET page_path = TRIM(page_path) WHERE page_path != TRIM(page_path);
