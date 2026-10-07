-- Seeds today's quiz for every department.
-- Run this after schema.sql. Re-run daily (or automate via a scheduled job /
-- admin tool) since quiz_questions are date-scoped by quiz_date.

insert into quiz_questions (department_id, quiz_date, question, options, correct_index)
select d.id, current_date, q.question, q.options, q.correct_index
from departments d
join (
  values
    ('Computer Science', 'What data structure uses FIFO (First In, First Out) ordering?',
      array['Stack','Queue','Tree','Graph'], 1),
    ('Computer Science', 'What is the time complexity of binary search?',
      array['O(n)','O(n log n)','O(log n)','O(1)'], 2),
    ('Computer Science', 'Which of these is NOT a programming paradigm?',
      array['Functional','Object-Oriented','Sequential Encryption','Procedural'], 2),

    ('Business Administration', E'What does \'ROI\' stand for?',
      array['Rate of Interest','Return on Investment','Risk of Insolvency','Revenue over Income'], 1),
    ('Business Administration', 'Which market structure has only one seller?',
      array['Oligopoly','Perfect Competition','Monopoly','Duopoly'], 2),
    ('Business Administration', E'In SWOT analysis, what does the \'O\' stand for?',
      array['Objectives','Opportunities','Outcomes','Operations'], 1),

    ('Law', E'What is \'stare decisis\'?',
      array['The right to remain silent','The principle of following legal precedent','A type of contract breach','A rule about jury selection'], 1),
    ('Law', 'A contract requires offer, acceptance, and what else?',
      array['Notarization','Consideration','Witnesses','Registration'], 1),
    ('Law', E'\'Mens rea\' refers to what in criminal law?',
      array['The guilty act','The guilty mind','The verdict','The sentence'], 1),

    ('Mechanical Engineering', E'What does Newton\'s Second Law relate force to?',
      array['Mass and velocity','Mass and acceleration','Energy and time','Momentum and distance'], 1),
    ('Mechanical Engineering', 'Which unit measures thermal energy?',
      array['Watt','Joule','Newton','Pascal'], 1),
    ('Mechanical Engineering', 'What type of stress acts perpendicular to a surface?',
      array['Shear stress','Normal stress','Torsional stress','Fatigue stress'], 1),

    ('Fine Arts', E'Which art movement is Salvador Dal\u00ed associated with?',
      array['Cubism','Surrealism','Impressionism','Baroque'], 1),
    ('Fine Arts', 'What are the three primary colors in traditional color theory?',
      array['Red, Green, Blue','Red, Yellow, Blue','Yellow, Orange, Purple','Black, White, Grey'], 1),
    ('Fine Arts', 'Chiaroscuro refers to the use of what in a painting?',
      array['Symmetry','Light and shadow','Perspective lines','Texture'], 1),

    ('Nursing', 'What is the normal resting adult heart rate range (bpm)?',
      array['40-60','60-100','100-140','140-180'], 1),
    ('Nursing', 'Which vital sign measures oxygen saturation?',
      array['Blood pressure','SpO2','Respiratory rate','Temperature'], 1),
    ('Nursing', E'What does \'NPO\' instruct a patient to do?',
      array['Take medication now','Nothing by mouth','Walk periodically','Note pain often'], 1)
) as q(department_name, question, options, correct_index)
  on d.name = q.department_name
where not exists (
  select 1 from quiz_questions qq
  where qq.department_id = d.id and qq.quiz_date = current_date
);
