(function () {
  var A = window.POPAuth;
  var LOGIN = '../login/log.html';

  function leave() {
    A.clear();
    window.location.replace(LOGIN);
  }

  var session = A.read();
  if (!session) {
    leave();
    return;
  }

  A.call('/api/session/check', session.t).then(function (r) {
    if (!r.ok) {
      if (r.error === 'network') {
        document.getElementById('gate').hidden = true;
        document.getElementById('top').hidden = false;
        document.getElementById('view').hidden = false;
        return;
      }
      leave();
      return;
    }
    var name = [r.firstName, r.lastName].filter(Boolean).join(' ');
    document.getElementById('who').textContent = name ? name + ' - ' + r.email : r.email;
    if (r.firstName) document.getElementById('hello').textContent = 'أهلا يا ' + r.firstName;
    document.getElementById('gate').hidden = true;
    document.getElementById('top').hidden = false;
    document.getElementById('view').hidden = false;
  });

  document.getElementById('out').addEventListener('click', function () {
    A.call('/api/session/end', session.t).then(leave, leave);
  });
})();
