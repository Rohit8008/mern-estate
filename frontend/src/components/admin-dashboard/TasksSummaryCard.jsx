import PropTypes from 'prop-types';

import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card';

export default function TasksSummaryCard({ tasks }) {
  return (
    <Card>
      <CardHeader className='pb-4'>
        <CardTitle>Tasks</CardTitle>
      </CardHeader>
      <CardContent className='pt-0'>
        <div className='flex items-center gap-6 text-sm'>
          <div>
            Due Today: <span className='font-semibold'>{tasks?.dueToday ?? 0}</span>
          </div>
          <div>
            Overdue: <span className='font-semibold'>{tasks?.overdue ?? 0}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

TasksSummaryCard.propTypes = {
  tasks: PropTypes.shape({
    dueToday: PropTypes.number,
    overdue: PropTypes.number,
  }),
};
