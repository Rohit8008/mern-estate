import PropTypes from 'prop-types';

import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card';

export default function ClientsByStatusCard({ clientsByStatus }) {
  return (
    <Card>
      <CardHeader className='pb-4'>
        <CardTitle>Clients by Status</CardTitle>
      </CardHeader>
      <CardContent className='pt-0'>
        <ul className='text-sm space-y-1'>
          {(clientsByStatus || []).map((s) => (
            <li key={s.status} className='flex items-center justify-between'>
              <span className='capitalize'>{s.status}</span>
              <span className='font-semibold'>{s.count}</span>
            </li>
          ))}
          {(clientsByStatus || []).length === 0 ? (
            <li className='text-slate-500'>No data</li>
          ) : null}
        </ul>
      </CardContent>
    </Card>
  );
}

ClientsByStatusCard.propTypes = {
  clientsByStatus: PropTypes.arrayOf(
    PropTypes.shape({
      status: PropTypes.string.isRequired,
      count: PropTypes.number.isRequired,
    })
  ),
};
