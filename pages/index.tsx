import { NextPage } from 'next';

const HomePage: NextPage = () => {
  return (
    <div style={{ 
      padding: '2rem', 
      fontFamily: 'system-ui, sans-serif',
      maxWidth: '600px',
      margin: '0 auto',
      textAlign: 'center'
    }}>
      <h1>Animals Proxy API</h1>
      <p>This is a backend service for syncing animal data between Cognito Forms and Shopify.</p>
      
      <div style={{ marginTop: '2rem', textAlign: 'left' }}>
        <h2>Available Endpoints:</h2>
        <ul>
          <li>
            <code>POST /api/cognito/webhook</code> - Webhook for Cognito form submissions
          </li>
          <li>
            <code>POST /api/sync/run</code> - Manual sync trigger
          </li>
        </ul>
      </div>
      
      <div style={{ marginTop: '2rem', fontSize: '0.9rem', color: '#666' }}>
        <p>Service Status: ✅ Online</p>
      </div>
    </div>
  );
};

export default HomePage;
