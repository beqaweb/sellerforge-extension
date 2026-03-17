import { useEffect, useRef, useState } from "react";

export default function usePersistentState(key, defaultValue) {
  const [value, setValue] = useState(defaultValue);
  const loaded = useRef(false);

  useEffect(() => {
    chrome.storage.local.get(key, (result) => {
      if (result[key] !== undefined) setValue(result[key]);
      loaded.current = true;
    });
  }, [key]);

  useEffect(() => {
    if (loaded.current) chrome.storage.local.set({ [key]: value });
  }, [key, value]);

  return [value, setValue];
}
