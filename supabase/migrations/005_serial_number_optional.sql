-- Make serial_number optional on machines table.
-- Postgres UNIQUE allows multiple NULLs by default.
ALTER TABLE public.machines ALTER COLUMN serial_number DROP NOT NULL;
