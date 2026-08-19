/* ============================================
   FRACTOR TRACTOR — Main JavaScript
   ============================================ */

document.addEventListener('DOMContentLoaded', () => {

  // --- Mobile Nav Toggle ---
  const navToggle = document.querySelector('.nav__toggle');
  const navLinks = document.querySelector('.nav__links');

  if (navToggle && navLinks) {
    navToggle.addEventListener('click', () => {
      navLinks.classList.toggle('open');
      navToggle.setAttribute('aria-expanded',
        navLinks.classList.contains('open'));
    });

    // Close mobile nav when a link is clicked
    navLinks.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        navLinks.classList.remove('open');
        navToggle.setAttribute('aria-expanded', 'false');
      });
    });
  }

  // --- Active Nav Link ---
  const currentPage = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav__links a').forEach(link => {
    const href = link.getAttribute('href');
    if (href === currentPage || (currentPage === '' && href === 'index.html')) {
      link.classList.add('active');
    }
  });

  // --- Scroll Animations (Intersection Observer) ---
  const animateOnScroll = () => {
    const elements = document.querySelectorAll('.animate-on-scroll');
    if (!elements.length) return;

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('animated');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

    elements.forEach(el => observer.observe(el));
  };
  animateOnScroll();

  // --- Contact Form Handler ---
  const contactForm = document.getElementById('contactForm');
  if (contactForm) {
    contactForm.addEventListener('submit', (e) => {
      e.preventDefault();

      const formData = new FormData(contactForm);
      const data = Object.fromEntries(formData);

      // Open the visitor's email client with the message pre-filled.
      // (No backend required — replace with a form service or Pages Function later if desired.)
      const subject = encodeURIComponent('[Fractor Tractor] ' + data.subject);
      const body = encodeURIComponent(
        'Name: ' + data.name + '\nEmail: ' + data.email + '\n\n' + data.message
      );
      window.location.href =
        'mailto:albert@trimultaneously.com?subject=' + subject + '&body=' + body;

      const btn = contactForm.querySelector('.btn');
      const originalText = btn.textContent;
      btn.textContent = 'Opening your email app…';
      btn.style.background = '#22c55e';
      btn.style.borderColor = '#22c55e';

      setTimeout(() => {
        btn.textContent = originalText;
        btn.style.background = '';
        btn.style.borderColor = '';
      }, 4000);
    });
  }

  // --- Support Ticket Form ---
  const supportForm = document.getElementById('supportForm');
  if (supportForm) {
    const formWrap = document.getElementById('ticketFormWrap');
    const confirmation = document.getElementById('ticketConfirmation');
    const referenceEl = document.getElementById('ticketReference');
    const errorBox = document.getElementById('ticketError');
    const submitBtn = document.getElementById('supportSubmit');
    const resetBtn = document.getElementById('ticketReset');

    const SUPPORT_EMAIL = 'albert@trimultaneously.com';

    const showError = (html) => {
      errorBox.innerHTML = html;
      errorBox.classList.add('ticket-status--error');
      errorBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };
    const clearError = () => {
      errorBox.innerHTML = '';
      errorBox.classList.remove('ticket-status--error');
    };

    // If the ticket can't be delivered we say so and hand the user a prefilled
    // email instead — we never show the confirmation unless the server sent it.
    const mailtoFallback = (data) => {
      const subject = encodeURIComponent('[Fractor Tractor Support] ' + data.category + ': ' + data.subject);
      const body = encodeURIComponent(
        'Name: ' + data.name + '\nEmail: ' + data.email +
        (data.appVersion ? '\nApp version: ' + data.appVersion : '') +
        '\n\n' + data.message
      );
      return 'mailto:' + SUPPORT_EMAIL + '?subject=' + subject + '&body=' + body;
    };

    supportForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearError();

      const data = Object.fromEntries(new FormData(supportForm));

      if (!data.name.trim() || !data.email.trim() || !data.subject.trim() || !data.message.trim()) {
        showError('Please fill in your name, email, subject, and description.');
        return;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email.trim())) {
        showError('That email address doesn’t look right — we need it to reply to you.');
        return;
      }

      const originalText = submitBtn.textContent;
      submitBtn.disabled = true;
      submitBtn.textContent = 'Sending…';

      try {
        const response = await fetch('/api/support', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
        const result = await response.json().catch(() => ({}));

        if (response.ok && result.ok && result.ticketId) {
          referenceEl.textContent = result.ticketId;
          formWrap.style.display = 'none';
          confirmation.classList.add('ticket-confirmation--visible');
          confirmation.scrollIntoView({ behavior: 'smooth', block: 'center' });
          supportForm.reset();
          return;
        }

        showError(
          (result.message || 'We couldn’t submit your ticket just now.') +
          ' Please <a href="' + mailtoFallback(data) + '">email it to us directly</a> and we’ll pick it up from there.'
        );
      } catch (err) {
        showError(
          'We couldn’t reach our servers — check your connection, or ' +
          '<a href="' + mailtoFallback(data) + '">email your ticket to us directly</a>.'
        );
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
      }
    });

    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        confirmation.classList.remove('ticket-confirmation--visible');
        formWrap.style.display = '';
        clearError();
        formWrap.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    }
  }

  // --- FAQ Accordion ---
  document.querySelectorAll('.faq__question').forEach(question => {
    question.addEventListener('click', () => {
      const item = question.parentElement;
      const isOpen = item.classList.contains('open');

      // Close all items
      document.querySelectorAll('.faq__item').forEach(i => i.classList.remove('open'));

      // Toggle clicked item
      if (!isOpen) {
        item.classList.add('open');
      }
    });
  });

  // --- Pricing Toggle (Monthly/Yearly) ---
  const pricingToggle = document.getElementById('pricingToggle');
  if (pricingToggle) {
    pricingToggle.addEventListener('change', () => {
      const isYearly = pricingToggle.checked;
      document.querySelectorAll('[data-monthly]').forEach(el => {
        // Update only the leading text node so the <span data-period> child survives
        el.firstChild.textContent = isYearly ? el.dataset.yearly : el.dataset.monthly;
      });
      document.querySelectorAll('[data-period]').forEach(el => {
        el.textContent = isYearly ? '/yr' : '/mo';
      });
    });
  }

  // --- Smooth scroll for anchor links ---
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', (e) => {
      const target = document.querySelector(anchor.getAttribute('href'));
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });

});
