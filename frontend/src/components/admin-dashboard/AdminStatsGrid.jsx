import PropTypes from 'prop-types';

import { Card, CardContent } from '../ui/Card';

export default function AdminStatsGrid({ totals }) {
  return (
    <div className='grid md:grid-cols-4 gap-4'>
      <StatCard title='Listings' value={totals?.listings} />
      <StatCard title='Clients' value={totals?.clients} />
      <StatCard title='Tasks' value={totals?.tasks} />
      <StatCard title='Team' value={totals?.team} />
    </div>
  );
}

function StatCard({ title, value }) {
  return (
    <Card>
      <CardContent className='p-4'>
        <div className='text-slate-600 text-sm'>{title}</div>
        <div className='text-2xl font-semibold'>{value ?? 0}</div>
      </CardContent>
    </Card>
  );
}

AdminStatsGrid.propTypes = {
  totals: PropTypes.shape({
    listings: PropTypes.number,
    clients: PropTypes.number,
    tasks: PropTypes.number,
    team: PropTypes.number,
  }),
};

StatCard.propTypes = {
  title: PropTypes.string.isRequired,
  value: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
};
