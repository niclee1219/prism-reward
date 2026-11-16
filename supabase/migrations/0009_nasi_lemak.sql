-- The second dish is now Nasi Lemak (id 'nasi-lemak'). Runs already saved under the old dish id move to the new
-- one, so the leaderboard shows the new dish's emoji, then the check constraint is swapped. Safe to run more than once.

alter table runs drop constraint if exists runs_dish_check;
update runs set dish = 'nasi-lemak' where dish = 'char-kway-teow';
alter table runs add constraint runs_dish_check check (dish is null or dish in ('chicken-rice', 'nasi-lemak', 'laksa'));
