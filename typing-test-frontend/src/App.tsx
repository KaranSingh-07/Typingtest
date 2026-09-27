import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import Lobby from './pages/Lobby';
import TypingTest from './pages/TypingTest';
import Results from './pages/Results';

function App() {
  return (
    <div className="min-h-screen bg-bgPrimary text-textPrimary">
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/lobby/:code" element={<Lobby />} />
          <Route path="/test/:code" element={<TypingTest />} />
          <Route path="/results/:code" element={<Results />} />
        </Routes>
      </BrowserRouter>
    </div>
  );
}

export default App;
