-- Sample content for local/dev testing: one 4-dimension personality quiz
-- (Extrovert/Introvert, Intuitive/Sensing, Thinking/Feeling, Judging/Perceiving),
-- 2 questions per dimension, and all 16 result profiles.
-- Run after 0001_init.sql. Safe to re-run: it clears prior rows for this quiz slug first.

delete from quizzes where slug = 'personality-type';

with new_quiz as (
  insert into quizzes (slug, title, description, is_published)
  values (
    'personality-type',
    'What''s Your Personality Type?',
    'Answer 8 quick questions to find out which of the 16 personality types fits you best.',
    true
  )
  returning id
),
dims as (
  insert into quiz_dimensions (quiz_id, key, low_label, high_label, sort_order)
  select id, key, low_label, high_label, sort_order
  from new_quiz, (values
    ('EI', 'Introvert', 'Extrovert', 1),
    ('SN', 'Sensing', 'Intuitive', 2),
    ('TF', 'Feeling', 'Thinking', 3),
    ('JP', 'Perceiving', 'Judging', 4)
  ) as d(key, low_label, high_label, sort_order)
  returning id, key, quiz_id
),
q as (
  insert into questions (quiz_id, prompt, sort_order)
  select nq.id, prompt, sort_order
  from new_quiz nq, (values
    ('At a party, you''re more likely to...', 1),
    ('After a long week, you recharge by...', 2),
    ('You tend to trust...', 3),
    ('When solving a problem, you focus more on...', 4),
    ('When making a decision, you weigh more heavily...', 5),
    ('Giving feedback, you''re more likely to lead with...', 6),
    ('Your workspace/schedule is usually...', 7),
    ('Before a trip, you prefer to...', 8)
  ) as p(prompt, sort_order)
  returning id, sort_order, quiz_id
)
insert into question_options (question_id, label, sort_order, scores)
select q.id, o.label, o.sort_order, o.scores::jsonb
from q
join (values
  (1, 'Introduce yourself to strangers', 1, '{"EI": 1}'),
  (1, 'Stick with people you already know', 2, '{"EI": -1}'),
  (2, 'Going out and being around people', 1, '{"EI": 1}'),
  (2, 'Quiet time alone', 2, '{"EI": -1}'),
  (3, 'Concrete facts and experience', 1, '{"SN": -1}'),
  (3, 'Patterns, theories, and possibilities', 2, '{"SN": 1}'),
  (4, 'What''s practical and proven', 1, '{"SN": -1}'),
  (4, 'What could be, even if untested', 2, '{"SN": 1}'),
  (5, 'Logic and consistency', 1, '{"TF": 1}'),
  (5, 'Impact on people involved', 2, '{"TF": -1}'),
  (6, 'The clearest, most direct critique', 1, '{"TF": 1}'),
  (6, 'Framing that considers people''s feelings', 2, '{"TF": -1}'),
  (7, 'Planned and organized', 1, '{"JP": 1}'),
  (7, 'Flexible and open-ended', 2, '{"JP": -1}'),
  (8, 'Book an itinerary in advance', 1, '{"JP": 1}'),
  (8, 'Decide things as you go', 2, '{"JP": -1}')
) as o(q_sort, label, sort_order, scores) on o.q_sort = q.sort_order;

with new_quiz as (
  select id from quizzes where slug = 'personality-type'
)
insert into result_profiles (quiz_id, code, name, description)
select new_quiz.id, code, name, description
from new_quiz, (values
  ('INTJ', 'The Architect', 'Strategic and independent, drawn to systems and long-range plans.'),
  ('INTP', 'The Thinker', 'Curious and analytical, energized by ideas and abstract problems.'),
  ('ENTJ', 'The Commander', 'Decisive and direct, natural at organizing people toward a goal.'),
  ('ENTP', 'The Debater', 'Quick-witted and exploratory, enjoys challenging assumptions.'),
  ('INFJ', 'The Advocate', 'Idealistic and insightful, focused on meaning and quiet impact.'),
  ('INFP', 'The Mediator', 'Values-driven and imaginative, seeks authenticity in everything.'),
  ('ENFJ', 'The Protagonist', 'Warm and persuasive, motivated by helping others grow.'),
  ('ENFP', 'The Campaigner', 'Enthusiastic and creative, thrives on new people and ideas.'),
  ('ISTJ', 'The Logistician', 'Practical and dependable, values order and follow-through.'),
  ('ISFJ', 'The Defender', 'Warm and meticulous, quietly looks out for others.'),
  ('ESTJ', 'The Executive', 'Organized and assertive, gets things done efficiently.'),
  ('ESFJ', 'The Consul', 'Sociable and dutiful, keeps groups running smoothly.'),
  ('ISTP', 'The Virtuoso', 'Hands-on and pragmatic, likes figuring out how things work.'),
  ('ISFP', 'The Adventurer', 'Gentle and spontaneous, expresses values through action.'),
  ('ESTP', 'The Entrepreneur', 'Bold and energetic, thrives on immediate action and risk.'),
  ('ESFP', 'The Entertainer', 'Playful and observant, lives fully in the moment.')
) as p(code, name, description);
