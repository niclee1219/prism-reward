-- Post-event purge. Run in the Supabase SQL editor (or psql) after the lucky draw has been drawn.
-- Deletes every lucky-draw entry (IRAS email + feedback text), as promised on the entry card.
-- Export first from /admin -> Export if you still need the feedback.
delete from draw_entries;

select count(*) as entries_remaining from draw_entries;
