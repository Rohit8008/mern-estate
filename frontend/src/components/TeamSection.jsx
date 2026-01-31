import React from 'react';
import { FaLinkedin, FaGithub, FaGlobe } from 'react-icons/fa';

export default function TeamSection({ title = 'Our Team', members = [] }) {
  return (
    <section className='py-10'>
      <h2 className='text-2xl font-bold mb-6 text-slate-800'>{title}</h2>
      <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6'>
        {members.map((m) => (
          <div key={m.name} className='border rounded-lg p-5 bg-white shadow-sm hover:shadow-md transition-shadow'>
            <div className='flex items-center gap-4'>
              <img
                src={m.avatar || 'https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_1280.png'}
                alt={m.name}
                className='w-16 h-16 rounded-full object-cover'
              />
              <div>
                <h3 className='text-lg font-semibold text-slate-800'>{m.name}</h3>
                <p className='text-slate-600 text-sm'>{m.role}</p>
              </div>
            </div>
            {m.bio && <p className='text-slate-700 text-sm mt-4'>{m.bio}</p>}
            <div className='flex items-center gap-4 mt-4'>
              {m.linkedin && (
                <a href={m.linkedin} target='_blank' rel='noreferrer' className='text-slate-600 hover:text-slate-900'>
                  <FaLinkedin />
                </a>
              )}
              {m.github && (
                <a href={m.github} target='_blank' rel='noreferrer' className='text-slate-600 hover:text-slate-900'>
                  <FaGithub />
                </a>
              )}
              {m.website && (
                <a href={m.website} target='_blank' rel='noreferrer' className='text-slate-600 hover:text-slate-900'>
                  <FaGlobe />
                </a>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
