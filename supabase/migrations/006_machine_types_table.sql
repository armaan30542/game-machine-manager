-- Admin-editable machine types table.
-- name is the PK so it can be referenced as plain text from machines.machine_type.
CREATE TABLE public.machine_types (
  name text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.machine_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read machine types"
  ON public.machine_types FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage machine types"
  ON public.machine_types FOR ALL TO authenticated
  USING ((SELECT public.is_admin()))
  WITH CHECK ((SELECT public.is_admin()));

-- Seed with existing machine types
INSERT INTO public.machine_types (name) VALUES
  ('American Nudge'),
  ('Aristocrat 1'),
  ('Aristocrat 2'),
  ('Aristocrat Monaco'),
  ('Aurora 1'),
  ('Aurora 3'),
  ('Aurora Link 3'),
  ('Aurora Superlink'),
  ('Aurora Superlink 1'),
  ('Bad Dog Hollywood'),
  ('Best Classic'),
  ('Best Of Nudge'),
  ('Cash City'),
  ('Crossbow 2'),
  ('Diamond Skill 1'),
  ('Diamond Skill 2'),
  ('Diamond Skill 3'),
  ('Diamond Skill 4'),
  ('Diamond Skill 5'),
  ('Diamond Skill 6'),
  ('Diamond Skill 7'),
  ('Diamond Skill 8'),
  ('Diamond Skill 9'),
  ('Fantasy Lane'),
  ('Fort Knox 1'),
  ('Fort Knox 2'),
  ('Fusion 1'),
  ('Fusion 2'),
  ('Fusion 3'),
  ('Fusion 4'),
  ('Fusion 5'),
  ('Fusion 6'),
  ('Fusion Lightning 1'),
  ('Fusion Lightning 2'),
  ('Fusion Lightning 3'),
  ('Fusion Lightning 4'),
  ('Fusion Lightning 6'),
  ('Fusion Link1'),
  ('Fusion Link2'),
  ('Fusion Link3'),
  ('Fusion Link4'),
  ('Gone Wild 2'),
  ('Hollywood'),
  ('JVL 1'),
  ('JVL 2'),
  ('Light & Wonder 1'),
  ('Light & Wonder 2'),
  ('Multi Nudge'),
  ('Nudge 4 Fun'),
  ('Phoenix Optimum 4'),
  ('Pick n Play Black'),
  ('Pick n Play Blue'),
  ('Pick n Play Red'),
  ('Pick n Play Purple'),
  ('Players Edge Cash Eruption'),
  ('Platinum 1'),
  ('Platinum 2'),
  ('Platinum 3'),
  ('Platinum 4'),
  ('Primero Generic'),
  ('QuantumLink 601'),
  ('SkyRiser 1'),
  ('Super Duo'),
  ('SuperSkill 1'),
  ('Sweet Road to Freedom'),
  ('The Price is Right'),
  ('Tip Top'),
  ('Twin Spin'),
  ('Zydexo Generic');
