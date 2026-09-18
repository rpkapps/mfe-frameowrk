import('./bootstrap').catch((cause: unknown) => {
  console.error('The test shell could not start.', cause);
  const root = document.getElementById('root');
  if (root) root.textContent = `The test shell could not start: ${String(cause)}`;
});
