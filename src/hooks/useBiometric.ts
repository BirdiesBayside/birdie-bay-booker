import { useState, useEffect, useCallback } from "react";
import { Capacitor } from "@capacitor/core";
import { NativeBiometric, BiometryType } from "capacitor-native-biometric";

const SERVER_ID = "birdies.golf";

interface BiometricState {
  isAvailable: boolean;
  biometryType: BiometryType | null;
  hasCredentials: boolean;
  isChecking: boolean;
}

export function useBiometric() {
  const [state, setState] = useState<BiometricState>({
    isAvailable: false,
    biometryType: null,
    hasCredentials: false,
    isChecking: true,
  });

  const isNative = Capacitor.isNativePlatform();

  const checkAvailability = useCallback(async () => {
    if (!isNative) {
      setState({
        isAvailable: false,
        biometryType: null,
        hasCredentials: false,
        isChecking: false,
      });
      return;
    }

    try {
      const result = await NativeBiometric.isAvailable();
      
      // Check if credentials are stored
      let hasCredentials = false;
      try {
        await NativeBiometric.getCredentials({ server: SERVER_ID });
        hasCredentials = true;
      } catch {
        hasCredentials = false;
      }

      setState({
        isAvailable: result.isAvailable,
        biometryType: result.biometryType,
        hasCredentials,
        isChecking: false,
      });
    } catch (error) {
      console.error("[Biometric] Availability check failed:", error);
      setState({
        isAvailable: false,
        biometryType: null,
        hasCredentials: false,
        isChecking: false,
      });
    }
  }, [isNative]);

  useEffect(() => {
    checkAvailability();
  }, [checkAvailability]);

  const getBiometryName = useCallback(() => {
    switch (state.biometryType) {
      case BiometryType.FACE_ID:
        return "Face ID";
      case BiometryType.TOUCH_ID:
        return "Touch ID";
      case BiometryType.FINGERPRINT:
        return "Fingerprint";
      case BiometryType.FACE_AUTHENTICATION:
        return "Face Authentication";
      case BiometryType.IRIS_AUTHENTICATION:
        return "Iris Authentication";
      default:
        return "Biometric";
    }
  }, [state.biometryType]);

  const saveCredentials = useCallback(async (email: string, password: string) => {
    if (!isNative || !state.isAvailable) {
      throw new Error("Biometric authentication not available");
    }

    try {
      await NativeBiometric.setCredentials({
        username: email,
        password: password,
        server: SERVER_ID,
      });
      
      setState(prev => ({ ...prev, hasCredentials: true }));
      return true;
    } catch (error) {
      console.error("[Biometric] Failed to save credentials:", error);
      throw error;
    }
  }, [isNative, state.isAvailable]);

  const authenticate = useCallback(async (): Promise<{ email: string; password: string } | null> => {
    if (!isNative || !state.isAvailable || !state.hasCredentials) {
      return null;
    }

    try {
      // Verify biometric first
      await NativeBiometric.verifyIdentity({
        reason: "Sign in to Birdies",
        title: "Sign In",
        subtitle: "Use biometric authentication",
        description: "Verify your identity to sign in",
      });

      // Get stored credentials
      const credentials = await NativeBiometric.getCredentials({
        server: SERVER_ID,
      });

      return {
        email: credentials.username,
        password: credentials.password,
      };
    } catch (error) {
      console.error("[Biometric] Authentication failed:", error);
      return null;
    }
  }, [isNative, state.isAvailable, state.hasCredentials]);

  const deleteCredentials = useCallback(async () => {
    if (!isNative) return;

    try {
      await NativeBiometric.deleteCredentials({
        server: SERVER_ID,
      });
      setState(prev => ({ ...prev, hasCredentials: false }));
    } catch (error) {
      console.error("[Biometric] Failed to delete credentials:", error);
    }
  }, [isNative]);

  return {
    isAvailable: state.isAvailable,
    biometryType: state.biometryType,
    hasCredentials: state.hasCredentials,
    isChecking: state.isChecking,
    isNative,
    getBiometryName,
    saveCredentials,
    authenticate,
    deleteCredentials,
    refresh: checkAvailability,
  };
}
