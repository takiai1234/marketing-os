-- Migration 058: Backfill likes_count + shares_count từ raw_payload
-- Áp dụng cho bài Twitter và Facebook đã ingest trước migration 056.
-- Dùng COALESCE để thử nhiều field name khác nhau (Apify schema thay đổi theo actor version).

-- ── Twitter ─────────────────────────────────────────────────────────────────
UPDATE news_article
   SET likes_count = COALESCE(
         NULLIF((raw_payload->>'likeCount'), '')::int,
         NULLIF((raw_payload->>'favorite_count'), '')::int,
         NULLIF((raw_payload->>'likes'), '')::int,
         NULLIF((raw_payload->>'likesCount'), '')::int,
         0
       ),
       shares_count = COALESCE(
         NULLIF((raw_payload->>'retweetCount'), '')::int,
         NULLIF((raw_payload->>'retweet_count'), '')::int,
         NULLIF((raw_payload->>'retweets'), '')::int,
         NULLIF((raw_payload->>'retweetsCount'), '')::int,
         0
       )
 WHERE source LIKE 'twitter:%'
   AND raw_payload IS NOT NULL
   AND (likes_count IS NULL OR shares_count IS NULL);

-- ── Facebook ─────────────────────────────────────────────────────────────────
UPDATE news_article
   SET likes_count = COALESCE(
         NULLIF((raw_payload->'reactions'->>'total'), '')::int,
         NULLIF((raw_payload->>'likesCount'), '')::int,
         NULLIF((raw_payload->>'likes'), '')::int,
         0
       ),
       shares_count = COALESCE(
         NULLIF((raw_payload->'shares'->>'count'), '')::int,
         NULLIF((raw_payload->>'sharesCount'), '')::int,
         NULLIF((raw_payload->>'shares'), '')::int,
         0
       )
 WHERE source LIKE 'facebook:%'
   AND raw_payload IS NOT NULL
   AND (likes_count IS NULL OR shares_count IS NULL);
