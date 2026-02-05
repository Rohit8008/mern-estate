import { useEffect, useState } from 'react';

export function useScrollThreshold(thresholdPx = 20) {
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > thresholdPx);
    };

    handleScroll();
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [thresholdPx]);

  return isScrolled;
}
