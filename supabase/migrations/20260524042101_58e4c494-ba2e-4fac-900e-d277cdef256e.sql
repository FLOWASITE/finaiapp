
-- 1) Thêm các cột v2
ALTER TABLE public.ai_memory_rules
  ADD COLUMN IF NOT EXISTS conditions jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS actions jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'suggest',
  ADD COLUMN IF NOT EXISTS confidence_threshold numeric(4,3) NOT NULL DEFAULT 0.8,
  ADD COLUMN IF NOT EXISTS applies_to text NOT NULL DEFAULT 'future',
  ADD COLUMN IF NOT EXISTS enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS paused_reason text,
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS previous_version_id uuid REFERENCES public.ai_memory_rules(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS schema_version smallint NOT NULL DEFAULT 1;

-- 2) CHECK constraints (DROP rồi ADD để idempotent)
ALTER TABLE public.ai_memory_rules DROP CONSTRAINT IF EXISTS ai_memory_rules_mode_check;
ALTER TABLE public.ai_memory_rules ADD CONSTRAINT ai_memory_rules_mode_check
  CHECK (mode IN ('auto','suggest','learn_only','disabled'));

ALTER TABLE public.ai_memory_rules DROP CONSTRAINT IF EXISTS ai_memory_rules_status_check;
ALTER TABLE public.ai_memory_rules ADD CONSTRAINT ai_memory_rules_status_check
  CHECK (status IN ('active','paused','disabled','draft'));

ALTER TABLE public.ai_memory_rules DROP CONSTRAINT IF EXISTS ai_memory_rules_applies_to_check;
ALTER TABLE public.ai_memory_rules ADD CONSTRAINT ai_memory_rules_applies_to_check
  CHECK (applies_to IN ('future','retroactive'));

ALTER TABLE public.ai_memory_rules DROP CONSTRAINT IF EXISTS ai_memory_rules_confidence_check;
ALTER TABLE public.ai_memory_rules ADD CONSTRAINT ai_memory_rules_confidence_check
  CHECK (confidence_threshold >= 0 AND confidence_threshold <= 1);

-- 3) Index hỗ trợ truy vấn
CREATE INDEX IF NOT EXISTS ai_memory_rules_conditions_gin ON public.ai_memory_rules USING gin (conditions jsonb_path_ops);
CREATE INDEX IF NOT EXISTS ai_memory_rules_actions_gin ON public.ai_memory_rules USING gin (actions jsonb_path_ops);
CREATE INDEX IF NOT EXISTS ai_memory_rules_status_idx ON public.ai_memory_rules(tenant_id, status, mode);

-- 4) Hàm parse when_text → jsonb conditions
CREATE OR REPLACE FUNCTION public.fn_parse_when_text(p_text text)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_conds jsonb := '[]'::jsonb;
  v_m text[];
  v_logic text := NULL;
  v_part text;
  v_parts text[];
BEGIN
  IF p_text IS NULL OR length(trim(p_text)) = 0 THEN
    RETURN '[]'::jsonb;
  END IF;

  -- Tách theo " AND " / " OR " (giữ logic)
  -- Đơn giản: tách AND trước; nếu chỉ 1 phần thì thử OR.
  v_parts := regexp_split_to_array(p_text, '\s+AND\s+');
  IF array_length(v_parts, 1) <= 1 THEN
    v_parts := regexp_split_to_array(p_text, '\s+OR\s+');
    IF array_length(v_parts, 1) > 1 THEN v_logic := 'OR'; END IF;
  ELSE
    v_logic := 'AND';
  END IF;

  FOR i IN 1 .. COALESCE(array_length(v_parts,1),0) LOOP
    v_part := trim(v_parts[i]);
    IF length(v_part) = 0 THEN CONTINUE; END IF;

    -- vendor = "..."
    v_m := regexp_match(v_part, 'vendor\s*=\s*"([^"]+)"', 'i');
    IF v_m IS NOT NULL THEN
      v_conds := v_conds || jsonb_build_object(
        'id', gen_random_uuid()::text,
        'logic', CASE WHEN i > 1 THEN v_logic ELSE NULL END,
        'field', 'vendor.name',
        'operator', 'equals',
        'value', v_m[1]
      );
      CONTINUE;
    END IF;

    -- description contains "..."
    v_m := regexp_match(v_part, 'description\s+contains?\s+"([^"]+)"', 'i');
    IF v_m IS NOT NULL THEN
      v_conds := v_conds || jsonb_build_object(
        'id', gen_random_uuid()::text,
        'logic', CASE WHEN i > 1 THEN v_logic ELSE NULL END,
        'field', 'description',
        'operator', 'contains',
        'value', v_m[1]
      );
      CONTINUE;
    END IF;

    -- amount > N / amount >= N / amount < N / amount <= N
    v_m := regexp_match(v_part, 'amount\s*(>=|<=|>|<)\s*([\d.,]+)', 'i');
    IF v_m IS NOT NULL THEN
      v_conds := v_conds || jsonb_build_object(
        'id', gen_random_uuid()::text,
        'logic', CASE WHEN i > 1 THEN v_logic ELSE NULL END,
        'field', 'amount',
        'operator', CASE v_m[1]
          WHEN '>'  THEN 'greater_than'
          WHEN '>=' THEN 'greater_than'
          WHEN '<'  THEN 'less_than'
          WHEN '<=' THEN 'less_than'
        END,
        'value', regexp_replace(v_m[2], '[.,]', '', 'g')::numeric
      );
      CONTINUE;
    END IF;

    -- category = "..."
    v_m := regexp_match(v_part, 'category\s*=\s*"([^"]+)"', 'i');
    IF v_m IS NOT NULL THEN
      v_conds := v_conds || jsonb_build_object(
        'id', gen_random_uuid()::text,
        'logic', CASE WHEN i > 1 THEN v_logic ELSE NULL END,
        'field', 'category.predicted',
        'operator', 'equals',
        'value', v_m[1]
      );
      CONTINUE;
    END IF;

    -- day_of_month = N → bỏ qua (không có field tương ứng v2)
  END LOOP;

  RETURN v_conds;
END $$;

-- 5) Hàm parse then_text → jsonb actions
CREATE OR REPLACE FUNCTION public.fn_parse_then_text(p_text text)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_actions jsonb := '[]'::jsonb;
  v_m text[];
  v_debit text;
  v_credit text;
  v_dept text;
BEGIN
  IF p_text IS NULL OR length(trim(p_text)) = 0 THEN
    RETURN '[]'::jsonb;
  END IF;

  -- Nợ XXX / Có YYY
  v_m := regexp_match(p_text, 'N[ơợ]\s*(\d{3,4})\s*/?\s*C[óo]\s*(\d{3,4})', 'i');
  IF v_m IS NOT NULL THEN
    v_debit := v_m[1];
    v_credit := v_m[2];
    v_actions := v_actions || jsonb_build_object(
      'id', gen_random_uuid()::text,
      'type', 'book',
      'params', jsonb_build_object(
        'account_debit', v_debit,
        'account_credit', v_credit
      )
    );
  END IF;

  -- "phòng ban X"
  v_m := regexp_match(p_text, 'ph[oò]ng\s*ban\s*"?([^",\.\n]+)"?', 'i');
  IF v_m IS NOT NULL THEN
    v_dept := trim(v_m[1]);
    v_actions := v_actions || jsonb_build_object(
      'id', gen_random_uuid()::text,
      'type', 'tag',
      'params', jsonb_build_object('department', v_dept)
    );
  END IF;

  -- Nếu không khớp pattern, ghi nhận action notify/raw để giữ thông tin
  IF jsonb_array_length(v_actions) = 0 THEN
    v_actions := v_actions || jsonb_build_object(
      'id', gen_random_uuid()::text,
      'type', 'notify',
      'params', jsonb_build_object('message_template', trim(p_text))
    );
  END IF;

  RETURN v_actions;
END $$;

-- 6) Trigger sync type ↔ (mode, status) khi cập nhật v2
CREATE OR REPLACE FUNCTION public.tg_ai_memory_rules_sync_v1()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Suy ngược type cũ từ mode + status để code v1 vẫn lọc được
  IF NEW.status = 'disabled' OR NEW.mode = 'disabled' THEN
    NEW.type := 'disabled';
  ELSIF NEW.mode = 'suggest' THEN
    NEW.type := 'suggestion';
  ELSE
    NEW.type := 'active';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS ai_memory_rules_sync_v1 ON public.ai_memory_rules;
CREATE TRIGGER ai_memory_rules_sync_v1
  BEFORE INSERT OR UPDATE OF mode, status ON public.ai_memory_rules
  FOR EACH ROW EXECUTE FUNCTION public.tg_ai_memory_rules_sync_v1();

-- 7) Backfill cho dữ liệu hiện tại
UPDATE public.ai_memory_rules
SET conditions = public.fn_parse_when_text(when_text),
    actions    = public.fn_parse_then_text(then_text),
    mode = CASE type WHEN 'active' THEN 'auto' WHEN 'suggestion' THEN 'suggest' ELSE 'disabled' END,
    status = CASE type WHEN 'disabled' THEN 'disabled' ELSE 'active' END,
    enabled = (type <> 'disabled'),
    schema_version = 2
WHERE schema_version = 1;
