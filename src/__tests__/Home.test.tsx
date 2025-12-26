import { render } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { Home } from '../pages/Home';
jest.mock('../services/firebase/config', () => ({
  firebaseConfig: {
    apiKey: 'test',
    authDomain: 'test',
    databaseURL: 'http://localhost',
    projectId: 'test',
    storageBucket: 'test',
    messagingSenderId: 'test',
    appId: 'test',
    measurementId: 'test',
  },
}));

describe('Home', () => {
  it('renderiza sem erros', () => {
    // Simple test to verify component renders without crashing
    const { container } = render(
      <BrowserRouter>
        <Home />
      </BrowserRouter>
    );
    expect(container).toBeTruthy();
  });
});
