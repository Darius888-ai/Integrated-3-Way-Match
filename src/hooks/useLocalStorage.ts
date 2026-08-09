import { useState, useEffect } from 'react';

export function useLocalStorage<T>(key: string, initialValue: T): [T, (value: T | ((val: T) => T)) => void] {

  // Read initial value from localStorage on first load

  const [storedValue, setStoredValue] = useState<T>(() => {

    try {

      const item = localStorage.getItem(key);

      return item ? JSON.parse(item) : initialValue;

    } catch (error) {

      console.error(`Error reading localStorage key "${key}":`, error);

      return initialValue;

    }

  });

  // Write updated value to localStorage whenever state changes

  useEffect(() => {

    try {

      localStorage.setItem(key, JSON.stringify(storedValue));

    } catch (error) {

      console.error(`Error writing localStorage key "${key}":`, error);

    }

  }, [key, storedValue]);

  return [storedValue, setStoredValue];

}
