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


  // Vision AI chat: images are handled in memory and are not stored by this page.
  const chatBody = $('#chatBody');
  const chatStatus = $('#chatStatus');
  const chatInput = $('#chatInput');
  const imageInput = $('#problemImage');
  const imagePreview = $('#imagePreview');
  const imagePreviewImg = $('#imagePreviewImg');
  const imageFileName = $('#imageFileName');
  const privacyConsent = $('#chatPrivacyConsent');
  let selectedProblemImage = null;
  let imageObjectUrl = null;
  let isAnalyzing = false;

  const appendBubble = (message, type) => {
    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble ' + (type === 'user' ? 'user-bubble' : 'bot-bubble');
    bubble.textContent = message;
    chatBody.appendChild(bubble);
    chatBody.scrollTop = chatBody.scrollHeight;
  };
  const setChatStatus = (message, connected) => {
    chatStatus.replaceChildren();
    const dot = document.createElement('i');
    chatStatus.append(dot, document.createTextNode(message));
    chatStatus.classList.toggle('is-connected', Boolean(connected));
  };
  const makeNode = (tag, className, content) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (content !== undefined) node.textContent = content;
    return node;
  };
  const serviceLabels = {
    plumbing:'سباكة', electrical:'كهرباء', carpentry:'نجارة',
    'air-conditioning':'تكييف', painting:'دهانات', cleaning:'تنظيف'
  };
  const appendDiagnosis = data => {
    const result = data.diagnosis || {};
    const card = makeNode('div','diagnosis-card');
    card.appendChild(makeNode('h4','',result.problem_title || 'ملخص المشكلة'));
    card.appendChild(makeNode('p','',result.problem_summary || 'تحليل مبدئي للصورة أو الوصف.'));
    card.appendChild(makeNode('p','','الخطوة المقترحة: ' + (result.recommended_next_step || 'اطلب معاينة من فني مختص.')));
    if (Array.isArray(result.likely_causes) && result.likely_causes.length) {
      card.appendChild(makeNode('b','','احتمالات تحتاج فحصًا'));
      const list=makeNode('ul','');
      result.likely_causes.slice(0,4).forEach(v=>list.appendChild(makeNode('li','',v)));
      card.appendChild(list);
    }
    if (Array.isArray(result.safe_actions) && result.safe_actions.length) {
      card.appendChild(makeNode('b','','تقدر تعمل إيه بأمان؟'));
      const list=makeNode('ul','');
      result.safe_actions.slice(0,4).forEach(v=>list.appendChild(makeNode('li','',v)));
      card.appendChild(list);
    }
    const meta=makeNode('div','diagnosis-meta');
    meta.appendChild(makeNode('span','diagnosis-chip','التخصص: '+(serviceLabels[data.category_slug]||'يحتاج معاينة')));
    const urgency=result.urgency||'medium';
    meta.appendChild(makeNode('span','diagnosis-chip'+((urgency==='high'||urgency==='emergency')?' urgent':''),urgency==='emergency'?'حالة طارئة':urgency==='high'?'تحتاج سرعة':urgency==='low'?'غير عاجلة غالبًا':'تحتاج فحصًا'));
    card.appendChild(meta);
    if(result.safety_warning){const warning=makeNode('p','', 'تنبيه سلامة: '+result.safety_warning);warning.style.color='#a34f30';warning.style.fontWeight='700';card.appendChild(warning);}
    chatBody.appendChild(card);
    chatBody.scrollTop=chatBody.scrollHeight;
  };
  const fillManualRequest = (data, artisan) => {
    const result=data.diagnosis||{};
    const name=serviceLabels[data.category_slug];
    if(name){const option=Array.from($('#serviceSelect').options).find(x=>x.textContent.trim()===name);if(option)$('#serviceSelect').value=option.value;}
    $('#problemText').value=(result.problem_summary||result.problem_title||'مشكلة تحتاج فحصًا')+(artisan?'\nمقدم الخدمة المختار مبدئيًا: '+artisan.full_name:'');
    const city=($('#chatCity').value||'').trim();
    const option=Array.from($('#citySelect').options).find(x=>x.textContent.trim()===city);
    $('#citySelect').value=option?option.value:'مدينة أخرى';
    $('#request').scrollIntoView({behavior:'smooth'});
    showToast('نقلنا ملخص المشكلة للنموذج اليدوي. الحجز الفعلي يحتاج تفعيل الحسابات والطلبات.');
  };
  const appendArtisans = (artisans,data) => {
    const wrap=makeNode('div','artisan-results');
    const head=makeNode('div','artisan-results-head');
    head.appendChild(makeNode('span','','صنايعية موثقون في منطقتك'));
    head.appendChild(makeNode('small','',(artisans||[]).length+' نتائج'));
    wrap.appendChild(head);
    if(!Array.isArray(artisans)||!artisans.length){
      wrap.appendChild(makeNode('div','artisan-empty','لم نجد صنايعيًا موثقًا ومتاحًا لهذا التخصص في المنطقة المدخلة. جرّب منطقة قريبة أو ارجع لاحقًا بعد انضمام مقدمي خدمة جدد.'));
    } else {
      artisans.slice(0,8).forEach(artisan=>{
        const card=makeNode('article','artisan-result-card');
        card.appendChild(makeNode('div','artisan-result-avatar',(artisan.full_name||'ص').trim().slice(0,1)));
        const main=makeNode('div','artisan-result-main');
        main.appendChild(makeNode('b','',(artisan.full_name||'مقدم خدمة')+(artisan.is_verified?'  ✓ موثق':'')));
        const rating=Number(artisan.average_rating||0).toFixed(1);
        main.appendChild(makeNode('small','','★ '+rating+' من 5 · '+Number(artisan.review_count||0)+' تقييم · '+(artisan.years_experience||0)+' سنة خبرة'));
        main.appendChild(makeNode('small','',[artisan.city,artisan.service_area].filter(Boolean).join(' · ')));
        if(artisan.bio)main.appendChild(makeNode('small','',artisan.bio));
        card.appendChild(main);
        card.appendChild(makeNode('span','artisan-result-rating','★ '+rating));
        const button=makeNode('button','','استخدم هذا الترشيح في الطلب');
        button.type='button';button.addEventListener('click',()=>fillManualRequest(data,artisan));
        card.appendChild(button);wrap.appendChild(card);
      });
    }
    chatBody.appendChild(wrap);chatBody.scrollTop=chatBody.scrollHeight;
  };
  const resizeImageForAnalysis = async file => {
    if(typeof createImageBitmap!=='function')return new Promise((resolve,reject)=>{
      const reader=new FileReader();reader.onerror=()=>reject(new Error('تعذر قراءة الصورة.'));
      reader.onload=()=>resolve({base64:String(reader.result).split(',')[1],mimeType:file.type});
      reader.readAsDataURL(file);
    });
    const bitmap=await createImageBitmap(file), maxSide=1280;
    const scale=Math.min(1,maxSide/Math.max(bitmap.width,bitmap.height));
    const canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
    const context=canvas.getContext('2d');if(!context)throw new Error('تعذر تجهيز الصورة للتحليل.');
    context.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',0.82));
    if(!blob)throw new Error('تعذر ضغط الصورة.');
    const dataUrl=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onerror=()=>reject(new Error('تعذر تجهيز الصورة.'));reader.onload=()=>resolve(reader.result);reader.readAsDataURL(blob);});
    return {base64:String(dataUrl).split(',')[1],mimeType:'image/jpeg'};
  };
  const sendDiagnosis = async () => {
    if(isAnalyzing)return;
    const message=(chatInput.value||'').trim(), city=($('#chatCity').value||'').trim();
    const area=($('#chatArea').value||'').trim(), file=selectedProblemImage;
    if(!message&&!file){showToast('اكتب وصفًا بسيطًا أو ارفع صورة للمشكلة.');return;}
    if(!city||!area){showToast('اكتب المدينة والمنطقة عشان نرشح صنايعية قريبين منك.');(!city?$('#chatCity'):$('#chatArea')).focus();return;}
    const config=window.SAN3TY_CONFIG||{};
    if(!config.supabaseUrl||!config.supabaseAnonKey){appendBubble('المساعد جاهز من ناحية الواجهة، لكن الاتصال لم يُفعّل بعد. أضف Supabase URL وPublic/Anon key في config.js، وانشر Edge Function، ثم جرّب مرة أخرى.','bot');setChatStatus('في انتظار إعداد الاتصال',false);return;}
    if(!privacyConsent.checked){showToast('وافق على إرسال الصورة أو الوصف إلى Google Gemini أولًا.');return;}
    isAnalyzing=true;const button=$('#chatSend');button.disabled=true;button.textContent='…';
    $('#chatFoot').textContent='بنحلل المشكلة ونبحث عن أفضل تطابق من بيانات الصنايعية…';
    setChatStatus('جارٍ تحليل المشكلة',false);
    appendBubble((file?'📷 صورة مرفقة — ':'')+(message||'حلّل الصورة المرفقة')+'\nالمنطقة: '+city+' / '+area,'user');
    chatInput.value='';
    try{
      const image=file?await resizeImageForAnalysis(file):null;
      const response=await fetch(config.supabaseUrl.replace(/\/$/,'')+'/functions/v1/diagnose-request',{
        method:'POST',
        headers:{'Content-Type':'application/json','apikey':config.supabaseAnonKey,'Authorization':'Bearer '+config.supabaseAnonKey},
        body:JSON.stringify({text:message,city,area,imageBase64:image?image.base64:null,mimeType:image?image.mimeType:null})
      });
      const payload=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(payload.error||'المساعد غير متاح حاليًا. حاول مرة أخرى.');
      appendDiagnosis(payload);appendArtisans(payload.artisans||[],payload);
      setChatStatus('متصل وجاهز للمساعدة',true);
      $('#chatFoot').textContent='التحليل مبدئي. التقييمات من قاعدة SAN3TY، وتوفر الفني يتغير باستمرار.';
      if(payload.diagnosis&&(payload.diagnosis.urgency==='high'||payload.diagnosis.urgency==='emergency'))appendBubble('لو في شرر أو رائحة غاز أو دخان أو خطر مباشر: ابتعد عن المكان واتصل بالطوارئ أو الجهة المختصة. لا تحاول الإصلاح بنفسك.','bot');
    }catch(error){appendBubble(error.message||'حصل خطأ في الاتصال. حاول مرة أخرى.','bot');setChatStatus('تعذر الاتصال',false);$('#chatFoot').textContent='تحقق من إعداد Supabase وGemini ثم أعد المحاولة.';}
    finally{isAnalyzing=false;button.disabled=false;button.textContent='↑';selectedProblemImage=null;imageInput.value='';imagePreview.hidden=true;imagePreviewImg.removeAttribute('src');if(imageObjectUrl){URL.revokeObjectURL(imageObjectUrl);imageObjectUrl=null;}privacyConsent.checked=false;}
  };
  $('#uploadPhotoBtn')?.addEventListener('click',()=>imageInput.click());
  imageInput?.addEventListener('change',()=>{
    const file=imageInput.files&&imageInput.files[0];if(!file)return;
    if(!['image/jpeg','image/png','image/webp'].includes(file.type)){showToast('ارفع صورة بصيغة JPG أو PNG أو WebP.');imageInput.value='';return;}
    if(file.size>8*1024*1024){showToast('حجم الصورة أكبر من 8 ميجابايت. اختار صورة أصغر.');imageInput.value='';return;}
    selectedProblemImage=file;if(imageObjectUrl)URL.revokeObjectURL(imageObjectUrl);imageObjectUrl=URL.createObjectURL(file);imagePreviewImg.src=imageObjectUrl;imageFileName.textContent=file.name;imagePreview.hidden=false;
  });
  $('#removeImageBtn')?.addEventListener('click',()=>{selectedProblemImage=null;imageInput.value='';imagePreview.hidden=true;imagePreviewImg.removeAttribute('src');if(imageObjectUrl){URL.revokeObjectURL(imageObjectUrl);imageObjectUrl=null;}privacyConsent.checked=false;});
  $('#chatSend')?.addEventListener('click',sendDiagnosis);
  chatInput?.addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();sendDiagnosis();}});

  // Minimal HTML escaping for values inserted into the local summary.
  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, character => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[character]);
  }

  $('#year').textContent = new Date().getFullYear();
})();
