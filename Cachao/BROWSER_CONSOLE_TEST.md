# Test DELETE API in Browser Console

## Simple Method (Copy & Paste)

Open your browser console on the frontend (while logged in) and paste this:

```javascript
(async () => {
  try {
    // Get token using Amplify
    const { fetchAuthSession } = await import('aws-amplify/auth');
    const session = await fetchAuthSession();
    const idToken = session.tokens?.idToken;
    
    let token = typeof idToken === 'string' ? idToken : (idToken?.toString?.() || String(idToken?.token || ''));
    
    if (!token) {
      console.error('❌ No token found');
      return;
    }
    
    console.log('✅ Token length:', token.length);
    
    // Get video ID
    const videoId = prompt('Enter video ID to delete:');
    if (!videoId) return;
    
    // Delete request
    const res = await fetch('https://6wwci7xpkc.execute-api.eu-west-1.amazonaws.com/Prod/videos', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token.trim()}`
      },
      body: JSON.stringify({ video_ids: [videoId] })
    });
    
    const result = await res.json();
    console.log('Status:', res.status);
    console.log('Result:', result);
    
  } catch (error) {
    console.error('Error:', error);
  }
})();
```

## Even Simpler - Using the Page's Composable

If the composable is available in the page context, try this:

```javascript
// On an event page, the composable might be accessible
// Try this first to see what's available:
console.log(window);

// Or try to access through Vue devtools if available
```

## Get Video ID

To get a video ID:
1. Go to an event page (e.g., `/events/1`)
2. Open browser DevTools → Network tab
3. Look for the request to `/events/1/videos`
4. Check the response - it contains video IDs
5. Or inspect a video element in the DOM





