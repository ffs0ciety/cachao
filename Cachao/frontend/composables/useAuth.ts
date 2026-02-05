import { signIn, signUp, signOut, getCurrentUser, fetchAuthSession, confirmSignUp, resetPassword, confirmResetPassword, resendSignUpCode } from 'aws-amplify/auth';

interface SignUpParams {
  email: string;
  password: string;
  name?: string;
}

interface SignInParams {
  email: string;
  password: string;
}

export const useAuth = () => {
  // Shared state so nav/profile update when login/logout in any component
  const user = useState<any>('auth-user', () => null);
  const isAuthenticated = useState<boolean>('auth-is-authenticated', () => false);
  const isLoading = useState<boolean>('auth-loading', () => true);
  const error = useState<string | null>('auth-error', () => null);

  // Check authentication status on mount
  const checkAuth = async () => {
    // Don't set loading state - this should be completely non-blocking
    try {
      // Add timeout to prevent hanging
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Auth check timeout')), 3000)
      );
      
      const currentUser = await Promise.race([
        getCurrentUser(),
        timeoutPromise
      ]) as any;
      
      // Explicitly set the values to ensure reactivity
      user.value = currentUser;
      isAuthenticated.value = true;
      error.value = null;
      
      console.log('Auth check successful, user authenticated:', currentUser.username);
      return true;
    } catch (err) {
      // Not authenticated - this is normal, not an error
      // Silently fail - don't log errors for unauthenticated users
      user.value = null;
      isAuthenticated.value = false;
      error.value = null;
      console.log('Auth check: user not authenticated');
      return false;
    }
  };

  // Sign up a new user
  const register = async (params: SignUpParams): Promise<{ success: boolean; error?: string; needsVerification?: boolean }> => {
    try {
      error.value = null;
      const { userId, nextStep } = await signUp({
        username: params.email,
        password: params.password,
        options: {
          userAttributes: {
            email: params.email,
            name: params.name || params.email.split('@')[0],
          },
        },
      });
      
      // If user needs to verify email, return that info
      if (nextStep?.signUpStep === 'CONFIRM_SIGN_UP') {
        return { 
          success: true, 
          needsVerification: true,
          error: 'Please check your email to verify your account before signing in.'
        };
      }
      
      // If signup was successful and user is automatically signed in
      if (nextStep?.signUpStep === 'DONE') {
        await checkAuth();
        return { success: true };
      }
      
      return { success: true, needsVerification: true };
    } catch (err: any) {
      const errorMessage = err.message || 'Failed to sign up';
      error.value = errorMessage;
      return { success: false, error: errorMessage };
    }
  };

  // Sign in
  const login = async (params: SignInParams & { newPassword?: string; session?: string }): Promise<{ success: boolean; error?: string; needsVerification?: boolean; requiresNewPassword?: boolean; session?: string }> => {
    try {
      error.value = null;
      
      // Use backend login endpoint to handle NEW_PASSWORD_REQUIRED challenge
      const config = useRuntimeConfig();
      const baseUrl = config.public.apiUrl;
      const basePath = config.public.apiBasePath || '';
      const url = `${baseUrl}${basePath}/auth/login`;
      
      const loginData: any = {
        email: params.email,
        password: params.password,
      };
      
      // If we have a new password and session, include them (for handling NEW_PASSWORD_REQUIRED)
      if (params.newPassword && params.session) {
        loginData.newPassword = params.newPassword;
        loginData.session = params.session;
      }
      
      const result = await $fetch<{ 
        success: boolean; 
        error?: string; 
        challenge?: string;
        requiresNewPassword?: boolean;
        session?: string;
        tokens?: any;
        message?: string;
      }>(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: loginData,
      });
      
      console.log('Backend login result:', result);
      
      // If login requires new password (NEW_PASSWORD_REQUIRED challenge)
      if (result.requiresNewPassword && result.session) {
        return {
          success: false,
          requiresNewPassword: true,
          session: result.session,
          error: result.message || 'Please set a new password to continue.',
        };
      }
      
      // If login was successful and we have tokens, we need to sync with Amplify
      if (result.success && result.tokens) {
        // If we just changed the password, try to sign in with Amplify using the new password
        // This will sync Amplify's auth state
        if (params.newPassword) {
          try {
            const amplifyResult = await signIn({
              username: params.email,
              password: params.newPassword,
            });
            
            if (amplifyResult.isSignedIn) {
              await checkAuth();
              return { success: true };
            }
          } catch (amplifyErr: any) {
            console.warn('Amplify sign-in sync failed after password change:', amplifyErr);
            // Try to check auth anyway - the session might still be valid
          }
        } else {
          // If we didn't change password, try to sign in with Amplify using the original password
          // This will sync Amplify's auth state
          try {
            const amplifyResult = await signIn({
              username: params.email,
              password: params.password,
            });
            
            if (amplifyResult.isSignedIn) {
              await checkAuth();
              return { success: true };
            }
          } catch (amplifyErr: any) {
            console.warn('Amplify sign-in sync failed:', amplifyErr);
            // If backend login succeeded, check auth anyway
          }
        }
        
        // Check auth status - it might have been updated by the backend login
        await checkAuth();
        if (isAuthenticated.value) {
          return { success: true };
        }
        
        // If still not authenticated, return success anyway since backend login succeeded
        // The tokens are in the response, and the user can continue
        return { success: true };
      }
      
      // If there's a challenge but not NEW_PASSWORD_REQUIRED, it might be verification
      if (result.challenge && result.challenge !== 'NEW_PASSWORD_REQUIRED') {
        return {
          success: false,
          needsVerification: true,
          error: 'Please verify your email address before signing in. Check your inbox for a verification code.',
        };
      }
      
      return { success: false, error: result.error || 'Login failed' };
    } catch (err: any) {
      console.error('Login error:', err);
      const errorMessage = err.message || err.data?.error || 'Failed to sign in';
      error.value = errorMessage;
      
      // Check if the error indicates NEW_PASSWORD_REQUIRED
      if (err.data?.requiresNewPassword && err.data?.session) {
        return {
          success: false,
          requiresNewPassword: true,
          session: err.data.session,
          error: err.data.message || 'Please set a new password to continue.',
        };
      }
      
      // Check for various unverified account error messages
      const isUnverifiedError = 
        errorMessage.includes('not confirmed') || 
        errorMessage.includes('UserNotConfirmedException') ||
        errorMessage.includes('User is not confirmed') ||
        errorMessage.includes('CONFIRM_SIGN_UP') ||
        errorMessage.includes('not verified') ||
        errorMessage.includes('verification');
      
      if (isUnverifiedError) {
        return { 
          success: false, 
          needsVerification: true,
          error: 'Please verify your email address before signing in. Check your inbox for a verification code.' 
        };
      }
      
      return { success: false, error: errorMessage };
    }
  };

  // Sign out
  const logout = async (): Promise<void> => {
    try {
      await signOut();
      user.value = null;
      isAuthenticated.value = false;
      error.value = null;
    } catch (err: any) {
      error.value = err.message || 'Failed to sign out';
    }
  };

  // Get authentication token for API calls
  const getAuthToken = async (forceRefresh: boolean = false): Promise<string | null> => {
    try {
      // Force refresh if token might be expired
      const session = await fetchAuthSession({ forceRefresh });
      
      if (!session || !session.tokens) {
        console.warn('No session or tokens available');
        return null;
      }
      
      // For Cognito authorizers, we need the ID token (not access token)
      const idToken = session.tokens.idToken;
      
      // Only log debug info if token extraction fails (to reduce console noise)
      // console.log('🔍 Token extraction debug:', {
      //   hasIdToken: !!idToken,
      //   idTokenType: typeof idToken,
      //   idTokenKeys: idToken && typeof idToken === 'object' ? Object.keys(idToken) : null,
      //   sessionKeys: Object.keys(session.tokens || {}),
      // });
      
      if (idToken) {
        let tokenString: string | null = null;
        
        // Check if it's already a string
        if (typeof idToken === 'string') {
          tokenString = idToken;
        } 
        // If it's an object, try different ways to extract the token
        else if (idToken && typeof idToken === 'object') {
          // AWS Amplify v6 uses a CognitoIdentityToken object with a toString() method
          // Try toString() method first (most common in Amplify v6)
          if ('toString' in idToken && typeof idToken.toString === 'function') {
            try {
              tokenString = idToken.toString();
            } catch (e) {
              console.warn('toString() failed:', e);
            }
          }
          // Try token property
          if (!tokenString && 'token' in idToken) {
            tokenString = String((idToken as any).token);
          }
          // Try payload property (some Amplify versions use this)
          if (!tokenString && 'payload' in idToken) {
            const payload = (idToken as any).payload;
            if (typeof payload === 'string') {
              tokenString = payload;
            } else if (payload && typeof payload === 'object' && 'toString' in payload) {
              tokenString = payload.toString();
            }
          }
          // Try direct access to the JWT string if it exists
          if (!tokenString && 'jwtToken' in idToken) {
            tokenString = String((idToken as any).jwtToken);
          }
        }
        
        if (tokenString) {
          // Clean the token string - remove any whitespace
          tokenString = tokenString.trim();
          
          // Validate it looks like a JWT (three parts separated by dots)
          const parts = tokenString.split('.');
          if (parts.length === 3) {
            // Additional validation: JWT parts should be base64url encoded (no padding issues)
            // Check if token is expired
            try {
              const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
              const exp = payload.exp;
              if (exp && exp * 1000 < Date.now()) {
                console.warn('ID token is expired, attempting to refresh...');
                // Try to refresh the token
                if (!forceRefresh) {
                  return await getAuthToken(true);
                }
                return null;
              }
              // Ensure token is a valid JWT string before returning
              if (tokenString && tokenString.length > 50 && parts.length === 3) {
                return tokenString;
              } else {
                console.error('Token does not appear to be a valid JWT string');
                return null;
              }
            } catch (parseErr) {
              console.error('Could not parse token payload:', parseErr);
              // If we can't parse it, it's likely not a valid JWT
              return null;
            }
          } else {
            console.error('ID token does not appear to be a valid JWT (expected 3 parts, got', parts.length, ')');
            console.error('Token preview:', tokenString.substring(0, 50), '...');
            return null;
          }
        }
      }
      
      // Don't fallback to access token for Cognito authorizer - it needs ID token
      // Access tokens won't work with Cognito User Pool authorizers
      console.error('ID token not available. Cognito authorizer requires ID token, not access token.');
      return null;
    } catch (err) {
      console.error('Error getting auth token:', err);
      return null;
    }
  };

  // Get user's Cognito sub (user ID)
  const getCognitoSub = async (): Promise<string | null> => {
    try {
      const session = await fetchAuthSession();
      // The sub (user ID) is in the ID token claims
      const idToken = session.tokens?.idToken;
      if (idToken) {
        // Decode the JWT token to get the sub claim
        const tokenString = typeof idToken === 'string' ? idToken : idToken.toString();
        const parts = tokenString.split('.');
        if (parts.length === 3) {
          try {
            const payload = JSON.parse(atob(parts[1]));
            return payload.sub || null;
          } catch (parseErr) {
            console.error('Error parsing token payload:', parseErr);
            return null;
          }
        }
      }
      return null;
    } catch (err) {
      console.error('Error getting cognito sub:', err);
      return null;
    }
  };

  // Get user's email from Cognito token
  const getUserEmail = async (): Promise<string | null> => {
    try {
      const session = await fetchAuthSession();
      const idToken = session.tokens?.idToken;
      if (idToken) {
        const tokenString = typeof idToken === 'string' ? idToken : idToken.toString();
        const parts = tokenString.split('.');
        if (parts.length === 3) {
          try {
            const payload = JSON.parse(atob(parts[1]));
            return payload.email || payload['cognito:username'] || null;
          } catch (parseErr) {
            console.error('Error parsing token payload:', parseErr);
            return null;
          }
        }
      }
      return null;
    } catch (err) {
      console.error('Error getting user email:', err);
      return null;
    }
  };

  // Confirm sign up with verification code
  const confirmSignUpCode = async (email: string, confirmationCode: string): Promise<{ success: boolean; error?: string }> => {
    try {
      error.value = null;
      await confirmSignUp({
        username: email,
        confirmationCode: confirmationCode,
      });
      
      console.log('Email verification successful');
      return { success: true };
    } catch (err: any) {
      console.error('Verification error:', err);
      const errorMessage = err.message || 'Failed to verify email';
      error.value = errorMessage;
      return { success: false, error: errorMessage };
    }
  };

  // Initiate password reset (forgot password)
  const forgotPassword = async (email: string): Promise<{ success: boolean; error?: string; message?: string }> => {
    try {
      error.value = null;
      console.log('Initiating password reset for:', email);
      const result = await resetPassword({
        username: email,
      });
      
      console.log('Password reset result:', result);
      console.log('Password reset code sent successfully');
      
      // Return success with helpful message
      return { 
        success: true,
        message: 'Password reset code sent! Please check your email (including spam/junk folder). The email may take a few minutes to arrive.'
      };
    } catch (err: any) {
      console.error('Forgot password error:', err);
      console.error('Error details:', {
        name: err.name,
        message: err.message,
        code: err.code,
        statusCode: err.$metadata?.httpStatusCode,
      });
      
      // Check for specific Cognito errors
      let errorMessage = err.message || 'Failed to send password reset code';
      
      // Provide more helpful error messages
      if (err.code === 'UserNotFoundException' || err.message?.includes('UserNotFoundException')) {
        errorMessage = 'User not found. Please check your email address.';
      } else if (err.code === 'InvalidParameterException' || err.message?.includes('InvalidParameterException')) {
        errorMessage = 'Invalid email address. Please check and try again.';
      } else if (
        err.code === 'LimitExceededException' || 
        err.message?.includes('LimitExceededException') ||
        err.message?.toLowerCase().includes('attempt limit exceeded') ||
        err.message?.toLowerCase().includes('limit exceeded')
      ) {
        errorMessage = 'Too many password reset attempts. Please wait 15-30 minutes before trying again. This helps protect your account from unauthorized access.';
      } else if (err.code === 'NotAuthorizedException' || err.message?.includes('NotAuthorizedException')) {
        errorMessage = 'Password reset is not allowed for this user.';
      } else if (
        err.code === 'TooManyRequestsException' || 
        err.message?.includes('TooManyRequestsException') ||
        err.message?.toLowerCase().includes('too many requests')
      ) {
        errorMessage = 'Too many requests. Please wait 15-30 minutes before trying again.';
      }
      
      error.value = errorMessage;
      return { success: false, error: errorMessage };
    }
  };

  // Confirm password reset with code and new password
  const confirmForgotPassword = async (
    email: string,
    confirmationCode: string,
    newPassword: string
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      error.value = null;
      await confirmResetPassword({
        username: email,
        confirmationCode: confirmationCode,
        newPassword: newPassword,
      });
      
      console.log('Password reset successful');
      return { success: true };
    } catch (err: any) {
      console.error('Confirm password reset error:', err);
      const errorMessage = err.message || 'Failed to reset password';
      error.value = errorMessage;
      return { success: false, error: errorMessage };
    }
  };

  // Resend verification code
  const resendVerificationCode = async (email: string): Promise<{ success: boolean; error?: string; message?: string }> => {
    try {
      error.value = null;
      // Try Cognito's resendSignUpCode first (works for self-registered users)
      await resendSignUpCode({
        username: email,
      });
      
      console.log('Verification code resent successfully via Cognito');
      return { success: true };
    } catch (err: any) {
      console.error('Resend verification code error (Cognito):', err);
      const errorMessage = err.message || 'Failed to resend verification code';
      
      // Check if this is the error for admin-created users
      if (errorMessage.includes("Can't resend confirmation code") || 
          errorMessage.includes("not confirmed") ||
          errorMessage.includes("admin-created")) {
        // Fall back to backend endpoint for admin-created users
        try {
          // Get API URL from runtime config (Nuxt 3)
          const config = useRuntimeConfig();
          const baseUrl = config.public.apiUrl;
          const basePath = config.public.apiBasePath || '';
          const url = `${baseUrl}${basePath}/auth/resend-verification-code`;
          
          const data = await $fetch<{ success: boolean; error?: string; message?: string }>(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: { email },
          });
          
          if (data.success) {
            console.log('Verification code resent successfully via backend');
            return { 
              success: true, 
              message: data.message || 'Verification code resent successfully' 
            };
          } else {
            error.value = data.error || 'Failed to resend verification code';
            return { success: false, error: data.error || 'Failed to resend verification code' };
          }
        } catch (backendErr: any) {
          console.error('Backend resend verification code error:', backendErr);
          error.value = backendErr.message || 'Failed to resend verification code';
          return { success: false, error: backendErr.message || 'Failed to resend verification code' };
        }
      }
      
      error.value = errorMessage;
      return { success: false, error: errorMessage };
    }
  };

  return {
    user: readonly(user),
    isAuthenticated: readonly(isAuthenticated),
    isLoading: readonly(isLoading),
    error: readonly(error),
    checkAuth,
    register, // Sign up enabled
    login,
    logout,
    confirmSignUpCode,
    forgotPassword,
    confirmForgotPassword,
    resendVerificationCode,
    getAuthToken,
    getCognitoSub,
    getUserEmail,
  };
};


