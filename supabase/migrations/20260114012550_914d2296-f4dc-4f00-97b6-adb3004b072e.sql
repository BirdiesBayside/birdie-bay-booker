-- Add control_mode column to bay_devices table to track Auto/Manual mode for each bay
ALTER TABLE public.bay_devices 
ADD COLUMN IF NOT EXISTS control_mode text NOT NULL DEFAULT 'auto' CHECK (control_mode IN ('auto', 'manual'));

-- Add index for faster queries
CREATE INDEX IF NOT EXISTS idx_bay_devices_control_mode ON public.bay_devices(control_mode);