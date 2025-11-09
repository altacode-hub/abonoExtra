import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import Home from '../pages/Home';

describe('Home', () => {
  it('renderiza título e subtítulo', () => {
    render(
      <BrowserRouter>
        <Home />
      </BrowserRouter>
    );
    expect(screen.getByRole('heading', { name: /missões de serviço extras/i })).toBeInTheDocument();
    expect(screen.getByText(/Escolha os dias/)).toBeInTheDocument();
  });
});