import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import { prewarmMarkdown } from './lib/markdown/setup'
import { ensureHighlighter } from './lib/shiki'
import './styles/globals.css'
import './styles/markdown.css'

void ensureHighlighter()
prewarmMarkdown()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
