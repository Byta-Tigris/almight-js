import React from 'react';
import logo from './logo.svg';
import './App.css';


function Default() {
  return <header className="App-header">
  <img src={logo} className="App-logo" alt="logo" />
  <p>
    Edit <code>src/App.tsx</code> and save to reload.
  </p>
  <a
    className="App-link"
    href="https://reactjs.org"
    target="_blank"
    rel="noopener noreferrer"
  >

  </a>
</header>
}


function App() {

  
  return (
    <div className="App">
      <Default />
    </div>
  );
}

export default App;
