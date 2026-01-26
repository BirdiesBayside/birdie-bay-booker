import { useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

export type LogEventType = 
  | 'app_launch' 
  | 'app_close_scheduled' 
  | 'app_close_manual' 
  | 'app_close_unexpected'
  | 'plug_on'
  | 'plug_off'
  | 'booking_active'
  | 'booking_ended'
  | 'window_fixed'
  | 'notification_shown'
  | 'manual_override_start'
  | 'manual_override_end'
  | 'error'
  | 'controller_start'
  | 'connection_lost'
  | 'connection_restored';

export type LogEventLevel = 'info' | 'warning' | 'error';

interface LogEntry {
  event_type: LogEventType;
  event_level: LogEventLevel;
  message: string;
  details?: Record<string, unknown>;
  booking_id?: string;
}

interface UseBayControllerLoggerOptions {
  bayNumber: number | null;
  appVersion: string;
  enabled?: boolean;
}

export function useBayControllerLogger({ 
  bayNumber, 
  appVersion, 
  enabled = true 
}: UseBayControllerLoggerOptions) {
  const logQueueRef = useRef<LogEntry[]>([]);
  const isFlushingRef = useRef(false);
  
  // Flush queued logs to the server
  const flushLogs = useCallback(async () => {
    if (!bayNumber || !enabled || logQueueRef.current.length === 0 || isFlushingRef.current) {
      return;
    }
    
    isFlushingRef.current = true;
    const logsToSend = [...logQueueRef.current];
    logQueueRef.current = [];
    
    try {
      const { error } = await supabase.functions.invoke("bay-controller-api", {
        body: { logs: logsToSend },
        headers: {
          "x-bay-number": bayNumber.toString(),
          "x-app-version": appVersion,
        },
      });
      
      if (error) {
        console.error("[BayLogger] Failed to send logs:", error);
        // Re-queue failed logs (up to 100 max)
        logQueueRef.current = [...logsToSend, ...logQueueRef.current].slice(0, 100);
      }
    } catch (err) {
      console.error("[BayLogger] Error sending logs:", err);
      // Re-queue failed logs
      logQueueRef.current = [...logsToSend, ...logQueueRef.current].slice(0, 100);
    } finally {
      isFlushingRef.current = false;
    }
  }, [bayNumber, appVersion, enabled]);
  
  // Add a log entry to the queue
  const sendLog = useCallback((
    eventType: LogEventType,
    message: string,
    options?: {
      level?: LogEventLevel;
      details?: Record<string, unknown>;
      bookingId?: string;
      immediate?: boolean;
    }
  ) => {
    if (!bayNumber || !enabled) return;
    
    const entry: LogEntry = {
      event_type: eventType,
      event_level: options?.level || 'info',
      message,
      details: options?.details,
      booking_id: options?.bookingId,
    };
    
    logQueueRef.current.push(entry);
    console.log(`[BayLogger] ${entry.event_level.toUpperCase()}: ${message}`);
    
    // Flush immediately for errors or if requested
    if (options?.immediate || options?.level === 'error') {
      flushLogs();
    } else if (logQueueRef.current.length >= 5) {
      // Batch flush when queue reaches 5 entries
      flushLogs();
    }
  }, [bayNumber, enabled, flushLogs]);
  
  // Convenience methods for common log types
  const logAppLaunch = useCallback((appName: string, bookingId?: string) => {
    sendLog('app_launch', `App launched: ${appName}`, { bookingId });
  }, [sendLog]);
  
  const logAppClose = useCallback((appName: string, reason: 'scheduled' | 'manual' | 'unexpected', bookingId?: string) => {
    const eventType: LogEventType = `app_close_${reason}`;
    const level: LogEventLevel = reason === 'unexpected' ? 'warning' : 'info';
    sendLog(eventType, `App closed (${reason}): ${appName}`, { level, bookingId });
  }, [sendLog]);
  
  const logPlugControl = useCallback((action: 'on' | 'off', plugName: string, isManual: boolean, bookingId?: string) => {
    const eventType: LogEventType = action === 'on' ? 'plug_on' : 'plug_off';
    sendLog(eventType, `Plug ${action.toUpperCase()}: ${plugName}${isManual ? ' (manual)' : ''}`, { 
      details: { isManual, plugName },
      bookingId 
    });
  }, [sendLog]);
  
  const logBookingActive = useCallback((customerName: string, startTime: string, endTime: string, bookingId: string) => {
    sendLog('booking_active', `Booking activated: ${customerName} (${startTime}-${endTime})`, { bookingId });
  }, [sendLog]);
  
  const logBookingEnded = useCallback((customerName: string, bookingId: string) => {
    sendLog('booking_ended', `Booking ended: ${customerName}`, { bookingId });
  }, [sendLog]);
  
  const logManualOverride = useCallback((isManual: boolean) => {
    const eventType: LogEventType = isManual ? 'manual_override_start' : 'manual_override_end';
    const level: LogEventLevel = isManual ? 'warning' : 'info';
    sendLog(eventType, isManual ? 'Manual mode activated' : 'Auto mode resumed', { level });
  }, [sendLog]);
  
  const logError = useCallback((message: string, error?: unknown, bookingId?: string) => {
    const details: Record<string, unknown> = {};
    if (error instanceof Error) {
      details.errorMessage = error.message;
      details.stack = error.stack;
    } else if (error) {
      details.error = String(error);
    }
    sendLog('error', message, { level: 'error', details, bookingId, immediate: true });
  }, [sendLog]);
  
  const logControllerStart = useCallback(() => {
    sendLog('controller_start', `Bay controller started (v${appVersion})`, { immediate: true });
  }, [sendLog, appVersion]);
  
  const logConnectionStatus = useCallback((connected: boolean) => {
    const eventType: LogEventType = connected ? 'connection_restored' : 'connection_lost';
    const level: LogEventLevel = connected ? 'info' : 'warning';
    sendLog(eventType, connected ? 'Connection restored' : 'Connection lost', { level, immediate: true });
  }, [sendLog]);
  
  const logWindowFixed = useCallback((appName: string) => {
    sendLog('window_fixed', `Window position corrected: ${appName}`);
  }, [sendLog]);
  
  const logNotificationShown = useCallback((notificationType: string, bookingId?: string) => {
    sendLog('notification_shown', `Notification shown: ${notificationType}`, { bookingId });
  }, [sendLog]);
  
  return {
    sendLog,
    flushLogs,
    logAppLaunch,
    logAppClose,
    logPlugControl,
    logBookingActive,
    logBookingEnded,
    logManualOverride,
    logError,
    logControllerStart,
    logConnectionStatus,
    logWindowFixed,
    logNotificationShown,
  };
}
