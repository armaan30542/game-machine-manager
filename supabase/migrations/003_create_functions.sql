-- =============================================================
-- ADD MACHINE TO LOCATION
-- =============================================================
CREATE OR REPLACE FUNCTION public.add_machine_to_location(
  p_machine_id uuid,
  p_location_id uuid,
  p_position smallint,
  p_user_id uuid,
  p_notes text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.machines WHERE id = p_machine_id AND location_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Machine is already deployed';
  END IF;

  IF EXISTS (SELECT 1 FROM public.machines WHERE location_id = p_location_id AND position_at_location = p_position) THEN
    RAISE EXCEPTION 'Position is already occupied at this location';
  END IF;

  UPDATE public.machines
  SET location_id = p_location_id, position_at_location = p_position, updated_at = now()
  WHERE id = p_machine_id;

  INSERT INTO public.audit_log (action, performed_by, location_id, machine_id, details, notes)
  VALUES ('machine_added_to_location', p_user_id, p_location_id, p_machine_id,
    jsonb_build_object('position', p_position), p_notes);
END;
$$;

-- =============================================================
-- REMOVE MACHINE FROM LOCATION
-- =============================================================
CREATE OR REPLACE FUNCTION public.remove_machine_from_location(
  p_machine_id uuid,
  p_user_id uuid,
  p_notes text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_location_id uuid;
BEGIN
  SELECT location_id INTO v_location_id FROM public.machines WHERE id = p_machine_id;

  IF v_location_id IS NULL THEN
    RAISE EXCEPTION 'Machine is already in inventory';
  END IF;

  UPDATE public.machines
  SET location_id = NULL, position_at_location = NULL, updated_at = now()
  WHERE id = p_machine_id;

  INSERT INTO public.audit_log (action, performed_by, location_id, machine_id, notes)
  VALUES ('machine_removed_from_location', p_user_id, v_location_id, p_machine_id, p_notes);
END;
$$;

-- =============================================================
-- REPLACE MACHINE (atomic swap)
-- =============================================================
CREATE OR REPLACE FUNCTION public.replace_machine(
  p_deployed_machine_id uuid,
  p_inventory_machine_id uuid,
  p_location_id uuid,
  p_user_id uuid,
  p_notes text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_deployed_position smallint;
BEGIN
  SELECT position_at_location INTO v_deployed_position
  FROM public.machines
  WHERE id = p_deployed_machine_id AND location_id = p_location_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Machine is not deployed at this location';
  END IF;

  IF EXISTS (SELECT 1 FROM public.machines WHERE id = p_inventory_machine_id AND location_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Replacement machine is not in inventory';
  END IF;

  -- Move deployed machine to inventory
  UPDATE public.machines
  SET location_id = NULL, position_at_location = NULL, updated_at = now()
  WHERE id = p_deployed_machine_id;

  -- Move inventory machine to location (same position)
  UPDATE public.machines
  SET location_id = p_location_id, position_at_location = v_deployed_position, updated_at = now()
  WHERE id = p_inventory_machine_id;

  INSERT INTO public.audit_log (action, performed_by, location_id, machine_id, details, notes)
  VALUES ('machine_replaced', p_user_id, p_location_id, p_inventory_machine_id,
    jsonb_build_object(
      'removed_machine_id', p_deployed_machine_id,
      'new_machine_id', p_inventory_machine_id,
      'position', v_deployed_position
    ), p_notes);
END;
$$;

-- =============================================================
-- CLOSE LOCATION
-- =============================================================
CREATE OR REPLACE FUNCTION public.close_location(
  p_location_id uuid,
  p_user_id uuid,
  p_close_date date DEFAULT CURRENT_DATE,
  p_notes text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_machine_ids uuid[];
  v_dispenser_id uuid;
BEGIN
  SELECT array_agg(id) INTO v_machine_ids
  FROM public.machines WHERE location_id = p_location_id;

  UPDATE public.machines
  SET location_id = NULL, position_at_location = NULL, updated_at = now()
  WHERE location_id = p_location_id;

  SELECT id INTO v_dispenser_id
  FROM public.dispensers WHERE location_id = p_location_id;

  IF v_dispenser_id IS NOT NULL THEN
    UPDATE public.dispensers
    SET location_id = NULL, updated_at = now()
    WHERE id = v_dispenser_id;
  END IF;

  UPDATE public.locations
  SET close_date = p_close_date, updated_at = now()
  WHERE id = p_location_id;

  INSERT INTO public.audit_log (action, performed_by, location_id, details, notes)
  VALUES ('location_closed', p_user_id, p_location_id,
    jsonb_build_object(
      'machines_returned', COALESCE(v_machine_ids, ARRAY[]::uuid[]),
      'dispenser_returned', v_dispenser_id IS NOT NULL,
      'close_date', p_close_date
    ), p_notes);
END;
$$;
