import { render } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { Home } from '../pages/Home';

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