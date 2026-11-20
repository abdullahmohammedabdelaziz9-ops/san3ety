(() => {
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  // Mobile navigation
  const menuToggle = $('#menuToggle');
  const mainNav = $('#mainNav');
  menuToggle?.addEventListener('click', () => {
    const isOpen = mainNav.classList.toggle('open');
    menuToggle.setAttribute('aria-expanded', String(isOpen));
    menuToggle.setAttribute('aria-label', isOpen ? 'إغلاق القائمة' : 'فتح القائمة');
  });
  $$('#mainNav a').forEach(link => link.addEventListener('click', () => {
    mainNav.classList.remove('open');
    menuToggle?.setAttribute('aria-expanded', 'false');
  }));

  // Scroll progress and reveal effects
  const progress = $('#scrollProgress');
  const updateProgress = () => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    progress.style.width = `${max > 0 ? (window.scrollY / max) * 100 : 0}%`;
  };
  window.addEventListener('scroll', updateProgress, { passive: true });
  updateProgress();

  const revealItems = $$('[data-reveal]');
  if ('IntersectionObserver' in window && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -35px 0px' });
    revealItems.forEach(item => observer.observe(item));
  } else {
    revealItems.forEach(item => item.classList.add('is-visible'));
  }

  // Toast helper
  const toast = $('#toast');
  let toastTimer;
  const showToast = message => {
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2700);
  };

  // Modals
  const openModal = id => {
    const modal = document.getElementById(id);
    if (!modal) return;
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    const focusTarget = $('button, input, select, textarea', modal);
    focusTarget?.focus();
  };
  const closeModal = modal => {
    modal.hidden = true;
    if (!$('.modal-backdrop:not([hidden])')) document.body.style.overflow = '';
  };
  $$('[data-open]').forEach(button => button.addEventListener('click', () => openModal(button.dataset.open)));
  $$('.modal-backdrop').forEach(modal => {
    modal.addEventListener('click', event => {
      if (event.target === modal || event.target.closest('[data-close]')) closeModal(modal);
    });
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') $$('.modal-backdrop:not([hidden])').forEach(closeModal);
  });

  // Service cards preselect the request form.
  $$('.service-card').forEach(card => card.addEventListener('click', () => {
    const select = $('#serviceSelect');
    const match = [...select.options].find(option => option.value === card.dataset.service);
    if (match) select.value = match.value;
    $('#request').scrollIntoView({ behavior: 'smooth' });
    setTimeout(() => $('#problemText').focus({ preventScroll: true }), 650);
  }));

  // Request demo form: summarize locally only, without network calls.
  $('#requestForm')?.addEventListener('submit', event => {
    event.preventDefault();
    const service = $('#serviceSelect').value;
    const problem = $('#problemText').value.trim();
    const city = $('#citySelect').value;
    const timing = $('#timingSelect').value;
    if (!service || !problem || !city || !timing) {
      showToast('كمّل البيانات المطلوبة الأول.');
      return;
    }
    $('#requestSummary').innerHTML = `<div><b>الخدمة:</b> ${escapeHtml(service)}</div><div><b>وصف المشكلة:</b> ${escapeHtml(problem)}</div><div><b>المنطقة:</b> ${escapeHtml(city)}</div><div><b>الميعاد:</b> ${escapeHtml(timing)}</div>`;
    openModal('resultModal');
  });

  // Craftsman registration demo.
  $('#joinForm')?.addEventListener('submit', event => {
    event.preventDefault();
    const name = $('#joinName').value.trim();
    const skill = $('#joinSkill').value;
    if (!name || !skill) return;
    closeModal($('#joinModal'));
    event.target.reset();
    showToast(`شكرًا يا ${name} — ده تسجيل تجريبي فقط.`);
  });

  // Interactive AI chat mock. Replies are intentionally scripted, not AI-generated.
  const chatBody = $('#chatBody');
  const quickReplies = $('#quickReplies');
  const scriptedReplies = {
    'التسريب مستمر طول الوقت': 'تمام، ده ممكن يشير لمشكلة في الوصلة أو المحبس. لو آمن، اقفل محبس المياه القريب لحد ما الفني يفحص المكان.',
    'بيظهر وقت الاستخدام بس': 'معلومة مهمة. غالبًا محتاجين نفحص صرف الحوض والوصلات أثناء الاستخدام. هل التسريب من عند السيفون ولا مش واضح؟',
    'مش متأكد': 'ولا يهمك. ممكن تصور مكان التسريب وقت طلب الخدمة، والفني هيقدر يحدد السبب بشكل أدق بعد المعاينة.'
  };
  const appendBubble = (text, type) => {
    const bubble = document.createElement('div');
    bubble.className = `chat-bubble ${type === 'user' ? 'user-bubble' : 'bot-bubble'}`;
    bubble.textContent = text;
    chatBody.appendChild(bubble);
    chatBody.scrollTop = chatBody.scrollHeight;
  };
  const sendDemoReply = reply => {
    appendBubble(reply, 'user');
    quickReplies.innerHTML = '';
    const response = scriptedReplies[reply] || 'وصلتني فكرتك. دي محادثة توضيحية، وربط المساعد بنموذج ذكاء اصطناعي هيكون في مرحلة الـBackend.';
    window.setTimeout(() => {
      appendBubble(response, 'bot');
      const next = document.createElement('button');
      next.type = 'button';
      next.textContent = 'ابدأ طلب الخدمة';
      next.addEventListener('click', () => $('#request').scrollIntoView({ behavior: 'smooth' }));
      quickReplies.appendChild(next);
    }, 420);
  };
  $$('#quickReplies button').forEach(button => button.addEventListener('click', () => sendDemoReply(button.dataset.reply)));
  $('#chatSend')?.addEventListener('click', () => showToast('المحادثة هنا نموذج تفاعلي بإجابات جاهزة للعرض.'));

  // Minimal HTML escaping for values inserted into the local summary.
  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, character => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[character]);
  }

  $('#year').textContent = new Date().getFullYear();
})();
