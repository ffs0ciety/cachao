// SIMPLE VERSION - Copy and paste this into browser console
// Make sure you're on the frontend and logged in

(async () => {
  try {
    // Import Amplify auth
    const amplifyAuth = await import('aws-amplify/auth');
    const { fetchAuthSession } = amplifyAuth;
    
    // Get session and token
    const session = await fetchAuthSession();
    const idToken = session.tokens?.idToken;
    
    // Extract token string
    let token = null;
    if (typeof idToken === 'string') {
      token = idToken;
    } else if (idToken?.toString) {
      token = idToken.toString();
    } else if (idToken?.token) {
      token = String(idToken.token);
    }
    
    if (!token) {
      console.error('❌ Could not get token. Session:', session);
      return;
    }
    
    console.log('✅ Token obtained, length:', token.length);
    
    // Get video ID from user
    const videoId = prompt('Enter video ID to delete:');
    if (!videoId) {
      console.log('Cancelled');
      return;
    }
    
    // Make DELETE request
    const url = 'https://6wwci7xpkc.execute-api.eu-west-1.amazonaws.com/Prod/videos';
    const response = await fetch(url, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token.trim()}`
      },
      body: JSON.stringify({ video_ids: [videoId] })
    });
    
    const result = await response.json();
    
    console.log('Status:', response.status);
    console.log('Result:', result);
    
    if (result.success) {
      console.log('✅ Success! Deleted', result.deleted_count, 'video(s)');
    } else {
      console.error('❌ Failed:', result.error);
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('Full error:', error);
  }
})();





