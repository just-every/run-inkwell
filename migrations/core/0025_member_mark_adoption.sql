-- SIGNX-002: how a member's saved signature was adopted (typed style, or a drawn or uploaded image), so a saved drawn
-- or uploaded mark is offered back like a typed one (ROUTE-009). JSON; NULL for marks saved before adoption existed
-- (typed in the sans italic style).
ALTER TABLE iw_member_marks ADD COLUMN mark TEXT;
