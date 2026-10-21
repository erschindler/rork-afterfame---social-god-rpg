-- Background simulation: pg_cron calls the `simulate` Edge Function every 5 minutes.
-- Replace the project ref in the URL when deploying to a different Supabase project.
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public.trigger_world_simulation()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s text;
BEGIN
  SELECT value INTO s FROM public.app_secrets WHERE name = 'cron_secret';
  PERFORM net.http_post(
    url := 'https://ekbxzajmdinupgpwjaxi.supabase.co/functions/v1/simulate',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', s),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
END;
$$;
REVOKE ALL ON FUNCTION public.trigger_world_simulation() FROM public, anon, authenticated;

DO $$
BEGIN
  PERFORM cron.unschedule('afterfame-world-sim') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'afterfame-world-sim');
  PERFORM cron.schedule('afterfame-world-sim', '*/5 * * * *', 'SELECT public.trigger_world_simulation();');
END $$;

-- Realtime notification toasts.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'notifications') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
END $$;
