// Copy and paste this code into your browser console on the frontend (while logged in)

// Method 1: Using the composable directly (if available in window)
// First, try to get the token using the composable
(async () => {
  try {
    // In Nuxt, composables might be available differently
    // Try accessing through the Vue app instance or use a simpler approach
    
    // Get token from Amplify directly
    const { fetchAuthSession } = await import('https://cdn.jsdelivr.net/npm/@aws-amplify/auth@6/dist/esm/index.mjs').catch(() => {
      // If that doesn't work, try accessing through the page's context
      return null;
    });
    
    if (!fetchAuthSession) {
      // Alternative: Use the composable if it's available in the page context
      console.log('Trying alternative method...');
      
      // Access the composable through the Vue app
      const app = document.querySelector('#__nuxt')?.__vue_app__;
      if (app) {
        // Try to get the composable
        console.log('Vue app found, but composables are not directly accessible');
      }
    }
    
    // Simplest approach: Use Amplify directly
    const { fetchAuthSession: amplifyFetchAuthSession } = await import('aws-amplify/auth');
    const session = await amplifyFetchAuthSession();
    const token = session.tokens?.idToken;
    
    let tokenString = null;
    if (typeof token === 'string') {
      tokenString = token;
    } else if (token && typeof token === 'object' && 'toString' in token) {
      tokenString = token.toString();
    } else if (token && typeof token === 'object' && 'token' in token) {
      tokenString = String(token.token);
    }
    
    if (!tokenString) {
      console.error('Could not extract token. Token object:', token);
      return;
    }
    
    console.log('Token extracted, length:', tokenString.length);
    console.log('Token preview:', tokenString.substring(0, 50) + '...');
    
    // Get video ID - you need to replace this with an actual video ID
    // You can find video IDs by:
    // 1. Opening an event page
    // 2. Looking at the network tab for GET /events/{id}/videos
    // 3. Or check the video elements in the DOM
    const videoId = prompt('Enter the video ID to delete:');
    
    if (!videoId) {
      console.log('No video ID provided, cancelling test');
      return;
    }
    
    console.log('Attempting to delete video:', videoId);
    
    // Test the delete endpoint
    const response = await fetch('https://6wwci7xpkc.execute-api.eu-west-1.amazonaws.com/Prod/videos', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tokenString.trim()}`
      },
      body: JSON.stringify({
        video_ids: [videoId]
      })
    });
    
    console.log('Response status:', response.status);
    console.log('Response headers:', Object.fromEntries(response.headers.entries()));
    
    const result = await response.json();
    console.log('Delete result:', result);
    
    if (result.success) {
      console.log('✅ Success! Deleted', result.deleted_count, 'video(s)');
    } else {
      console.error('❌ Error:', result.error);
    }
    
  } catch (error) {
    console.error('Error testing delete:', error);
    console.error('Error details:', error.message, error.stack);
  }
})();





