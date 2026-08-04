import { BrowserRouter, Routes, Route } from 'react-router-dom'
import LegacyHub from './pages/LegacyHub'
import LegacyStart from './pages/LegacyStart'
import LegacyPlay from './pages/LegacyPlay'
import LegacyChapterView from './pages/LegacyChapter'
import LegacyMap from './pages/LegacyMap'
import LegacyAchievements from './pages/LegacyAchievements'
import LegacyCharacter from './pages/LegacyCharacter'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LegacyHub />} />
        <Route path="/legacy" element={<LegacyHub />} />
        <Route path="/legacy/start" element={<LegacyStart />} />
        <Route path="/legacy/play/:sessionId" element={<LegacyPlay />} />
        <Route path="/legacy/chapter/:chapterId" element={<LegacyChapterView />} />
        <Route path="/legacy/map" element={<LegacyMap />} />
        <Route path="/legacy/achievements" element={<LegacyAchievements />} />
        <Route path="/legacy/character/:memberId" element={<LegacyCharacter />} />
      </Routes>
    </BrowserRouter>
  )
}
