import PropTypes from 'prop-types';

import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card';

export default function TopAgentsTableCard({ topAgents }) {
  return (
    <Card>
      <CardHeader className='pb-4'>
        <CardTitle>Top Agents (Last 30 days)</CardTitle>
      </CardHeader>
      <CardContent className='pt-0'>
        <table className='min-w-full text-sm'>
          <thead>
            <tr className='text-left'>
              <th className='p-2'>Agent</th>
              <th className='p-2'>Email</th>
              <th className='p-2'>Clients</th>
            </tr>
          </thead>
          <tbody>
            {(topAgents || []).map((a) => (
              <tr key={a.userId} className='border-t'>
                <td className='p-2'>{a.username}</td>
                <td className='p-2'>{a.email}</td>
                <td className='p-2'>{a.clients}</td>
              </tr>
            ))}
            {(topAgents || []).length === 0 ? (
              <tr>
                <td colSpan={3} className='p-4 text-slate-500'>
                  No data
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

TopAgentsTableCard.propTypes = {
  topAgents: PropTypes.arrayOf(
    PropTypes.shape({
      userId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
      username: PropTypes.string,
      email: PropTypes.string,
      clients: PropTypes.number,
    })
  ),
};
