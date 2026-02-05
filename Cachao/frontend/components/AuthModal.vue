<template>
  <div v-if="isOpen" class="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50" @click.self="close">
    <div class="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 border border-gray-100">
      <div class="p-8">
        <div class="flex justify-between items-center mb-8">
          <h2 class="text-2xl font-semibold text-gray-900">
            {{ showForgotPassword ? 'Reset Password' : showResetPassword ? 'Set New Password' : needsVerification ? 'Verify Email' : showSignUp ? 'Sign Up' : 'Sign In' }}
          </h2>
          <button
            @click="close"
            class="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <!-- Toggle between Sign In and Sign Up -->
        <div v-if="!needsVerification && !requiresNewPassword && !showForgotPassword && !showResetPassword" class="mb-6 flex border-b border-gray-200">
          <button
            @click="showSignUp = false"
            :class="[
              'flex-1 py-3 px-4 text-center font-medium transition-colors',
              !showSignUp ? 'text-primary border-b-2 border-primary' : 'text-gray-500 hover:text-gray-700'
            ]"
          >
            Sign In
          </button>
          <button
            @click="showSignUp = true"
            :class="[
              'flex-1 py-3 px-4 text-center font-medium transition-colors',
              showSignUp ? 'text-primary border-b-2 border-primary' : 'text-gray-500 hover:text-gray-700'
            ]"
          >
            Sign Up
          </button>
        </div>

        <div v-if="authError" class="mb-6 bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg">
          <p class="font-semibold">Error:</p>
          <p>{{ authError }}</p>
          <p v-if="authError.includes('Too many') || authError.includes('limit exceeded')" class="text-sm mt-2 text-red-700">
            💡 <strong>Tip:</strong> If you need immediate access, contact support. Otherwise, please wait 15-30 minutes before trying again.
          </p>
        </div>

        <div v-if="requiresNewPassword" class="mb-6 bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 rounded-lg">
          <p class="font-semibold mb-2">🔑 Set Your Password</p>
          <p class="text-sm">Your account requires a password change. Please enter a new password below.</p>
        </div>

        <div v-if="needsVerification" class="mb-6 bg-blue-50 border border-blue-200 text-blue-800 px-4 py-3 rounded-lg">
          <p class="font-semibold mb-2">📧 Check your email!</p>
          <p class="text-sm mb-2">We sent a verification code to <strong>{{ email }}</strong></p>
          <p class="text-sm font-medium">Enter the 6-digit code from your email below:</p>
          <div v-if="resendCodeSuccess" class="mt-2 text-sm text-green-700 font-medium">
            ✅ Verification code resent! Check your email.
            <span v-if="resendCodeMessage" class="block mt-1">{{ resendCodeMessage }}</span>
          </div>
        </div>

        <div v-if="showForgotPassword" class="mb-6 bg-blue-50 border border-blue-200 text-blue-800 px-4 py-3 rounded-lg">
          <p class="font-semibold mb-2">🔐 Reset your password</p>
          <p class="text-sm mb-2">Enter your email address and we'll send you a code to reset your password.</p>
          <p class="text-xs text-blue-700 mt-2">💡 <strong>Tip:</strong> Check your spam/junk folder if you don't receive the email within a few minutes.</p>
        </div>

        <div v-if="showResetPassword" class="mb-6 bg-blue-50 border border-blue-200 text-blue-800 px-4 py-3 rounded-lg">
          <p class="font-semibold mb-2">📧 Check your email!</p>
          <p class="text-sm mb-2">We sent a password reset code to <strong>{{ email }}</strong></p>
          <p class="text-sm font-medium mb-2">Enter the code and your new password below:</p>
          <p class="text-xs text-blue-700">💡 <strong>Didn't receive it?</strong> Check your spam/junk folder. The email may take a few minutes to arrive.</p>
        </div>

        <!-- Verification Code Form -->
        <form v-if="requiresNewPassword" @submit.prevent="handleSubmit" class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">
              New Password
            </label>
            <input
              v-model="newPassword"
              type="password"
              required
              minlength="8"
              class="w-full px-4 py-2 border border-gray-200 rounded-full focus:outline-none focus:ring-2 focus:ring-primary text-gray-900 placeholder-gray-400"
              placeholder="Enter your new password"
            />
            <p class="mt-1 text-xs text-gray-500">Must be at least 8 characters with uppercase, lowercase, and numbers</p>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">
              Confirm New Password
            </label>
            <input
              v-model="confirmPassword"
              type="password"
              required
              minlength="8"
              class="w-full px-4 py-2 border border-gray-200 rounded-full focus:outline-none focus:ring-2 focus:ring-primary text-gray-900 placeholder-gray-400"
              placeholder="Confirm your new password"
            />
          </div>
          <button
            type="submit"
            :disabled="loading || !newPassword || !confirmPassword || newPassword !== confirmPassword"
            class="w-full bg-primary text-white py-3 px-4 rounded-full hover:bg-primary-600 focus:outline-none focus:ring-2 focus:ring-primary disabled:bg-gray-200 disabled:cursor-not-allowed font-medium"
          >
            {{ loading ? 'Setting Password...' : 'Set New Password' }}
          </button>
        </form>

        <form v-if="needsVerification" @submit.prevent="handleVerification" class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">
              Verification Code
            </label>
            <input
              v-model="verificationCode"
              type="text"
              required
              maxlength="6"
              class="w-full px-4 py-3 border border-gray-200 rounded-full focus:outline-none focus:ring-2 focus:ring-primary text-center text-2xl tracking-widest text-gray-900 placeholder-gray-400"
              placeholder="000000"
              autocomplete="one-time-code"
            />
            <p class="mt-1 text-xs text-gray-500">
              Enter the 6-digit code from your email
            </p>
          </div>

          <button
            type="submit"
            :disabled="loading"
            class="w-full bg-blue-600 text-white py-2 px-4 rounded-full hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <span v-if="loading">Verifying...</span>
            <span v-else>Verify Email</span>
          </button>

          <div class="flex gap-2">
            <button
              type="button"
              @click="handleResendCode"
              :disabled="resendCodeLoading"
              class="flex-1 text-sm text-blue-600 hover:text-blue-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed border border-blue-300 py-2 px-4 rounded-full hover:bg-blue-50"
            >
              <span v-if="resendCodeLoading">Sending...</span>
              <span v-else>Resend Code</span>
            </button>
            <button
              type="button"
              @click="needsVerification = false"
              class="flex-1 text-sm text-gray-600 hover:text-gray-900 transition-colors border border-gray-200 py-2 px-4 rounded-full hover:bg-gray-50 bg-white font-medium"
            >
              Back to Sign In
            </button>
          </div>
        </form>

        <!-- Forgot Password Form -->
        <form v-if="showForgotPassword" @submit.prevent="handleForgotPassword" class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-dark-text-secondary mb-2">
              Email
            </label>
            <input
              v-model="email"
              type="email"
              required
              class="w-full px-4 py-2 border border-gray-200 rounded-full focus:outline-none focus:ring-2 focus:ring-primary text-gray-900 placeholder-gray-400"
              placeholder="your@email.com"
            />
          </div>

          <button
            type="submit"
            :disabled="loading"
            class="w-full bg-blue-600 text-white py-2 px-4 rounded-full hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <span v-if="loading">Sending code...</span>
            <span v-else>Send Reset Code</span>
          </button>

          <button
            type="button"
            @click="showForgotPassword = false"
            class="w-full text-sm text-gray-600 hover:text-gray-900 transition-colors font-medium"
          >
            Back to Sign In
          </button>
        </form>

        <!-- Reset Password Form -->
        <form v-else-if="showResetPassword" @submit.prevent="handleResetPassword" class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-dark-text-secondary mb-2">
              Reset Code
            </label>
            <input
              v-model="resetCode"
              type="text"
              required
              maxlength="6"
              class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-center text-2xl tracking-widest"
              placeholder="000000"
              autocomplete="one-time-code"
            />
            <p class="mt-1 text-xs text-dark-text-muted">
              Enter the 6-digit code from your email
            </p>
          </div>

          <div>
            <label class="block text-sm font-medium text-dark-text-secondary mb-2">
              New Password
            </label>
            <input
              v-model="newPassword"
              type="password"
              required
              class="w-full px-4 py-2 border border-gray-200 rounded-full focus:outline-none focus:ring-2 focus:ring-primary text-gray-900 placeholder-gray-400"
              placeholder="••••••••"
            />
            <p class="mt-1 text-xs text-dark-text-muted">
              Must be at least 8 characters with uppercase, lowercase, and numbers
            </p>
          </div>

          <div>
            <label class="block text-sm font-medium text-dark-text-secondary mb-2">
              Confirm New Password
            </label>
            <input
              v-model="confirmPassword"
              type="password"
              required
              class="w-full px-4 py-2 border border-gray-200 rounded-full focus:outline-none focus:ring-2 focus:ring-primary text-gray-900 placeholder-gray-400"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            :disabled="loading || newPassword !== confirmPassword"
            class="w-full bg-blue-600 text-white py-2 px-4 rounded-full hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <span v-if="loading">Resetting password...</span>
            <span v-else>Reset Password</span>
          </button>

          <button
            type="button"
            @click="showResetPassword = false; showForgotPassword = true"
            class="w-full text-sm text-gray-600 hover:text-gray-900 transition-colors font-medium"
          >
            Back
          </button>
        </form>

        <!-- Sign Up Form -->
        <form v-if="showSignUp && !needsVerification && !requiresNewPassword && !showForgotPassword && !showResetPassword" @submit.prevent="handleSignUp" class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-dark-text-secondary mb-2">
              Name
            </label>
            <input
              v-model="name"
              type="text"
              required
              class="w-full px-4 py-2 border border-gray-200 rounded-full focus:outline-none focus:ring-2 focus:ring-primary text-gray-900 placeholder-gray-400"
              placeholder="Your Name"
            />
          </div>

          <div>
            <label class="block text-sm font-medium text-dark-text-secondary mb-2">
              Email
            </label>
            <input
              v-model="email"
              type="email"
              required
              class="w-full px-4 py-2 border border-gray-200 rounded-full focus:outline-none focus:ring-2 focus:ring-primary text-gray-900 placeholder-gray-400"
              placeholder="your@email.com"
            />
          </div>

          <div>
            <label class="block text-sm font-medium text-dark-text-secondary mb-2">
              Password
            </label>
            <input
              v-model="password"
              type="password"
              required
              class="w-full px-4 py-2 border border-gray-200 rounded-full focus:outline-none focus:ring-2 focus:ring-primary text-gray-900 placeholder-gray-400"
              placeholder="••••••••"
            />
            <p class="mt-1 text-xs text-dark-text-muted">
              Must be at least 8 characters with uppercase, lowercase, and numbers
            </p>
          </div>

          <button
            type="submit"
            :disabled="loading"
            class="w-full bg-green-600 text-white py-2 px-4 rounded-full hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <span v-if="loading">Creating account...</span>
            <span v-else>Sign Up</span>
          </button>
        </form>

        <!-- Sign In Form -->
        <form v-else-if="!showSignUp && !needsVerification && !showForgotPassword && !showResetPassword" @submit.prevent="handleSubmit" class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-dark-text-secondary mb-2">
              Email
            </label>
            <input
              v-model="email"
              type="email"
              required
              class="w-full px-4 py-2 border border-gray-200 rounded-full focus:outline-none focus:ring-2 focus:ring-primary text-gray-900 placeholder-gray-400"
              placeholder="your@email.com"
            />
          </div>

          <div>
            <label class="block text-sm font-medium text-dark-text-secondary mb-2">
              Password
            </label>
            <input
              v-model="password"
              type="password"
              required
              class="w-full px-4 py-2 border border-gray-200 rounded-full focus:outline-none focus:ring-2 focus:ring-primary text-gray-900 placeholder-gray-400"
              placeholder="••••••••"
            />
          </div>

          <div class="flex justify-end">
            <button
              type="button"
              @click="showForgotPassword = true"
              class="text-sm text-blue-600 hover:text-blue-800 transition-colors"
            >
              Forgot Password?
            </button>
          </div>

          <button
            type="submit"
            :disabled="loading"
            class="w-full bg-blue-600 text-white py-2 px-4 rounded-full hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <span v-if="loading">Signing in...</span>
            <span v-else>Sign In</span>
          </button>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  isOpen: boolean;
}>();

const emit = defineEmits<{
  close: [];
  authenticated: [];
}>();

const { login, register, confirmSignUpCode, forgotPassword, confirmForgotPassword, resendVerificationCode } = useAuth();

const email = ref('');
const password = ref('');
const name = ref('');
const verificationCode = ref('');
const resetCode = ref('');
const newPassword = ref('');
const confirmPassword = ref('');
const loading = ref(false);
const authError = ref<string | null>(null);
const needsVerification = ref(false);
const requiresNewPassword = ref(false);
const loginSession = ref<string | null>(null); // Store session for NEW_PASSWORD_REQUIRED challenge
const showForgotPassword = ref(false);
const showResetPassword = ref(false);
const showSignUp = ref(false);
const storedPassword = ref(''); // Store password for auto-login after verification
const resendCodeLoading = ref(false);
const resendCodeSuccess = ref(false);
const resendCodeMessage = ref('');

const close = () => {
  emit('close');
  authError.value = null;
  email.value = '';
  password.value = '';
  name.value = '';
  needsVerification.value = false;
  requiresNewPassword.value = false;
  loginSession.value = null;
  verificationCode.value = '';
  showForgotPassword.value = false;
  showResetPassword.value = false;
  showSignUp.value = false;
  resetCode.value = '';
  newPassword.value = '';
  confirmPassword.value = '';
  resendCodeLoading.value = false;
  resendCodeSuccess.value = false;
  resendCodeMessage.value = '';
};

const handleSignUp = async () => {
  loading.value = true;
  authError.value = null;

  // Validate password requirements
  if (password.value.length < 8) {
    authError.value = 'Password must be at least 8 characters long';
    loading.value = false;
    return;
  }

  try {
    const result = await register({
      email: email.value,
      password: password.value,
      name: name.value || email.value.split('@')[0],
    });

    if (result.success) {
      if (result.needsVerification) {
        // Store password for auto-login after verification
        storedPassword.value = password.value;
        needsVerification.value = true;
        authError.value = null; // Clear error, show verification form
      } else {
        // Sign up successful and user is automatically signed in
        await new Promise(resolve => setTimeout(resolve, 100));
        emit('authenticated');
        close();
      }
    } else {
      authError.value = result.error || 'Failed to create account';
    }
  } catch (err: any) {
    authError.value = err.message || 'An unexpected error occurred';
  } finally {
    loading.value = false;
  }
};

const handleSubmit = async () => {
  loading.value = true;
  authError.value = null;

  try {
    const loginParams: any = {
      email: email.value,
      password: password.value,
    };
    
    // If we have a new password and session, include them (for handling NEW_PASSWORD_REQUIRED)
    if (requiresNewPassword.value && newPassword.value && loginSession.value) {
      loginParams.newPassword = newPassword.value;
      loginParams.session = loginSession.value;
    }
    
    const result = await login(loginParams);

    if (result.success) {
      // Small delay to ensure auth state is updated
      await new Promise(resolve => setTimeout(resolve, 100));
      emit('authenticated');
      close();
    } else {
      // If login requires new password (for users with temporary passwords)
      if (result.requiresNewPassword && result.session) {
        requiresNewPassword.value = true;
        loginSession.value = result.session;
        authError.value = null; // Clear error, show password change form
      }
      // If login failed due to unverified account, show verification form
      else if (result.needsVerification) {
        storedPassword.value = password.value; // Store password for auto-login
        needsVerification.value = true;
        authError.value = null; // Clear error, show verification form instead
      } else {
        authError.value = result.error || 'Authentication failed';
      }
    }
  } catch (err: any) {
    authError.value = err.message || 'An unexpected error occurred';
  } finally {
    loading.value = false;
  }
};

const handleVerification = async () => {
  loading.value = true;
  authError.value = null;

  try {
    const result = await confirmSignUpCode(email.value, verificationCode.value);

    if (result.success) {
      // Verification successful, now try to sign in automatically
      const loginResult = await login({
        email: email.value,
        password: storedPassword.value || password.value,
      });

      if (loginResult.success) {
        await new Promise(resolve => setTimeout(resolve, 100));
        emit('authenticated');
        close();
      } else {
        authError.value = loginResult.error || 'Verification successful, but sign in failed. Please try signing in manually.';
        needsVerification.value = false;
      }
    } else {
      authError.value = result.error || 'Verification failed';
    }
  } catch (err: any) {
    authError.value = err.message || 'An unexpected error occurred';
  } finally {
    loading.value = false;
  }
};

const handleForgotPassword = async () => {
  loading.value = true;
  authError.value = null;

  try {
    const result = await forgotPassword(email.value);

    if (result.success) {
      // Show reset password form
      showForgotPassword.value = false;
      showResetPassword.value = true;
      // Show success message if provided
      if (result.message) {
        // The message is already shown in the blue info box, but we can log it
        console.log(result.message);
      }
    } else {
      authError.value = result.error || 'Failed to send reset code';
    }
  } catch (err: any) {
    authError.value = err.message || 'An unexpected error occurred';
  } finally {
    loading.value = false;
  }
};

const handleResetPassword = async () => {
  loading.value = true;
  authError.value = null;

  // Validate passwords match
  if (newPassword.value !== confirmPassword.value) {
    authError.value = 'Passwords do not match';
    loading.value = false;
    return;
  }

  // Validate password requirements (Cognito requirements)
  if (newPassword.value.length < 8) {
    authError.value = 'Password must be at least 8 characters long';
    loading.value = false;
    return;
  }

  try {
    const result = await confirmForgotPassword(
      email.value,
      resetCode.value,
      newPassword.value
    );

    if (result.success) {
      // Password reset successful, show success message and return to login
      authError.value = null;
      showResetPassword.value = false;
      // Show success message
      alert('Password reset successful! You can now sign in with your new password.');
      close();
    } else {
      authError.value = result.error || 'Failed to reset password';
    }
  } catch (err: any) {
    authError.value = err.message || 'An unexpected error occurred';
  } finally {
    loading.value = false;
  }
};

const handleResendCode = async () => {
  if (!email.value) {
    authError.value = 'Email address is required';
    return;
  }

  resendCodeLoading.value = true;
  resendCodeSuccess.value = false;
  authError.value = null;

  try {
    const result = await resendVerificationCode(email.value);

    if (result.success) {
      resendCodeSuccess.value = true;
      resendCodeMessage.value = result.message || '';
      authError.value = null;
      // Clear success message after 8 seconds
      setTimeout(() => {
        resendCodeSuccess.value = false;
        resendCodeMessage.value = '';
      }, 8000);
    } else {
      authError.value = result.error || 'Failed to resend verification code';
      resendCodeMessage.value = '';
    }
  } catch (err: any) {
    authError.value = err.message || 'An unexpected error occurred';
  } finally {
    resendCodeLoading.value = false;
  }
};
</script>

