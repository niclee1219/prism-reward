-- Post-event purge. Run in the Supabase SQL editor (or psql) after the prize draw.
-- Deletes every email whose owner did not opt in to PRISM updates, as promised on the email screen.
update players set email = null where email is not null and email_consent = false;

-- To delete ALL emails, including those who opted in to updates, run this instead:
-- update players set email = null, email_consent = false;

select count(*) filter (where email is not null) as emails_remaining from players;
