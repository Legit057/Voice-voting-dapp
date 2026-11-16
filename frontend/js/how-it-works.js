/**
 * VOICE • js/how-it-works.js
 * How It Works Page: Searchable & Categorized FAQ Accordion, Meme Illustration
 */

import { injectLayout } from './layout.js';
import { loadMemes, renderMemeMedia } from './memes.js';

document.addEventListener('DOMContentLoaded', async () => {
  try { injectLayout(); } catch (e) { console.error('injectLayout failed in how-it-works.js:', e); }
  try { initCategorizedFaq(); } catch (e) { console.error('initCategorizedFaq failed:', e); }
  try { await initFaqMemeIllustration(); } catch (e) { console.error('initFaqMemeIllustration failed:', e); }
});

function initCategorizedFaq() {
  const searchInput = document.getElementById('faqSearchInput');
  const categoryBtns = document.querySelectorAll('.faq-category-btn');
  const items = Array.from(document.querySelectorAll('.faq-accordion-item, .accordion-item'));

  let activeCategory = 'all';
  let searchQuery = '';

  function filterItems() {
    items.forEach((item) => {
      const category = item.getAttribute('data-category') || 'getting-started';
      const questionText = item.querySelector('.faq-question-btn span, .accordion-trigger span')?.textContent?.toLowerCase() || '';
      const answerText = item.querySelector('.faq-answer-panel, .accordion-panel')?.textContent?.toLowerCase() || '';

      const matchesCategory = activeCategory === 'all' || category === activeCategory;
      const matchesSearch = !searchQuery || questionText.includes(searchQuery) || answerText.includes(searchQuery);

      if (matchesCategory && matchesSearch) {
        item.style.display = 'block';
      } else {
        item.style.display = 'none';
      }
    });
  }

  // Category Tabs
  categoryBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      categoryBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeCategory = btn.getAttribute('data-category') || 'all';
      filterItems();
    });
  });

  // Search Input Filter
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      searchQuery = e.target.value.trim().toLowerCase();
      filterItems();
    });
  }

  // Accordion Toggle
  items.forEach((item) => {
    const btn = item.querySelector('.faq-question-btn, .accordion-trigger');
    if (btn) {
      btn.addEventListener('click', () => {
        const isOpen = item.classList.contains('open');
        items.forEach(other => {
          if (other !== item) other.classList.remove('open');
        });
        item.classList.toggle('open', !isOpen);
        btn.setAttribute('aria-expanded', String(!isOpen));
      });
    }
  });
}

async function initFaqMemeIllustration() {
  const container = document.getElementById('faqMemeContainer');
  if (!container) return;

  const memes = await loadMemes();
  const meme = memes[3] || memes[0];

  container.innerHTML = `
    <div class="faq-meme-art-card">
      ${renderMemeMedia(meme, { width: 320, height: 220, className: 'faq-meme-img' })}
      <div style="font-family: var(--font-mono); font-size: 0.8rem; font-weight: 700; color: var(--accent-orange); text-transform: uppercase;">
        Decentralized Consensus
      </div>
      <p style="font-size: 0.88rem; color: var(--text-muted); line-height: 1.4;">
        "Every vote is a permanent cryptographic block state transition on Ethereum."
      </p>
    </div>
  `;
}
