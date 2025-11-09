import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MissionCard } from '../components/MissionCard';

describe('MissionCard toggle', () => {
  it('calls onToggle with mission id and new state', async () => {
    const user = userEvent.setup();
    const mission = {
      id: 'm1',
      titulo: 'Polícia Mais Forte',
      local: '16º BPM',
      data: '2024-01-24',
      horario: '17:00',
      tipo: 'Operação',
      disponivel: true,
      inscrito: false,
    };

    const onToggle = vi.fn();
    render(<MissionCard mission={mission} onToggle={onToggle} />);

    const toggleBtn = screen.getByRole('button');
    await user.click(toggleBtn);

    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onToggle).toHaveBeenCalledWith('m1', true);
  });
});