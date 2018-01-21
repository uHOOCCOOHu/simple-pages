(function() {
  'use strict';

  Vue.use(VeeValidate);

  Vue.component('loginPage', {
    template: '#templ-login-page',
    props: {
      loginInfo: { required: true },
    },
    data: function() {
      return {
        initFiles: [
          'init/.simple-pages',
          'init/index.json',
          'init/article.templ',
          'init/index.html',
          'init/css.css',
        ],
        saveKey: 'simplePagesLoginInfo',
        password: '',
        logining: false,

        errorMsg: null,
        showErrorMsg: false,
      };
    },
    mounted: function() {
      const last = localStorage.getItem(this.saveKey);
      if(last) {
        Object.assign(this.loginInfo, JSON.parse(last));
        this.$refs.password.focus();
      } else {
        this.$refs.username.focus();
      }
    },
    methods: {
      saveLoginInfo: function() {
        localStorage.setItem(this.saveKey, JSON.stringify(this.loginInfo));
      },
      onSubmit: function() {
        this.$validator.validateAll()
            .then(ret => ret && this.login());
      },
      login: function() {
        if(this.logining)
          throw new TypeError('Double login');

        this.logining = true;
        this.showErrorMsg = false;

        let loginCfg = {
          username: this.loginInfo.username,
          password: this.password,
          repo: this.loginInfo.repo,
          branch: this.loginInfo.branch,
        };
        GhBlog
          .load(loginCfg)
          .then(ghb => ghb.available ? ghb : this.checkDoInit(ghb))
          .then(ghb => {
            if(ghb && ghb.available) {
              this.saveLoginInfo();
              this.$emit('success', ghb);
            }
          })
          .catch(err => {
            console.error(err);
            this.errorMsg = `Failed!\n${err.message}`;
            this.showErrorMsg = true;
          })
          .then(() => this.logining = false);
      },
      checkDoInit: function(ghb) {
        if(!confirm('Not initialized by simple-pages! Init it now?\n' +
                    'DANGER: may replace your existing files')) {
          return undefined;
        }
        const reqs = this
          .initFiles
          .map(path => {
            return this.$http
              .get(path, { responseType: 'text' })
              .then(response => ({
                path: removeLeadingPath(path),
                content: response.bodyText,
              }));
          });
        return Promise.all(reqs)
          .then(files => ghb.doInit(files))
          .then(ghb => ghb.reload());
        function removeLeadingPath(s) {
          return s.slice(s.lastIndexOf('/') + 1);
        }
      },
    },
  });

  Vue.component('mainPage', {
    template: '#templ-main-page',
    props: {
      loginInfo: { default: undefined },
      ghBlogIn:  { required: true, type: GhBlog },
    },
    data: function() {
      return {
        ghBlog: this.ghBlogIn,
        curArticle: null,
        saving: false,

        errorMsg: null,
        showErrorMsg: false,
        showSaveMsg: false,
      };
    },
    computed: {
      saveKey: function() {
        if(this.loginInfo === undefined)
          return undefined;
        return 'simplePagesModifiedArticles|' +
               encodeURI(this.loginInfo.username) + '|' +
               encodeURI(this.loginInfo.repo) + '|' +
               encodeURI(this.loginInfo.branch);
      },
    },
    mounted: function() {
      if(this.saveKey === undefined)
        return;
      const savedObj = JSON.parse(localStorage.getItem(this.saveKey) || '[]');
      if(savedObj.length && confirm('Recover the last unsaved articles?')) {
        const notFounds = this.loadLocal(savedObj);
        if(notFounds > 0)
          this.$nextTick(() => {
            window.alert(
              `Cannot find bases of ${notFounds} recovered articles. ` +
              'They are marked as new articles now.'
            );
          });
      }
      this.$watch(
        'ghBlog.articles',
        _.throttle(() => this.saveLocal(), 3000),
        { deep: true },
      );
    },
    methods: {
      saveLocal: function() {
        const s = JSON.stringify(this.getModifiedArticles(), (k, v) => {
          if(v instanceof Article) {
            const min = v.toMinimal();
            if(v.resetable)
              min.oldName = v.getOld().name;
            return min;
          } else
            return v;
        });
        localStorage.setItem(this.saveKey, s);
      },
      loadLocal: function(savedObj) {
        const articles = this.ghBlog.articles;
        let baseNotFound = 0;
        savedObj
          .reverse() // unshift in reverse order
          .forEach(o => {
            const cur = new Article(o);
            if(o.oldName !== undefined) {
              const base = articles.find(t => t.name === o.oldName);
              if(base !== undefined) {
                this.ghBlog.loadArticle(base) // Load the source first, or reset
                    .then(() => Object.assign(base, cur));     // will be broken
              } else {
                baseNotFound++;
                articles.unshift(cur);
              }
            } else
              articles.unshift(cur);
          });
        return baseNotFound;
      },
      checkInfo: function(article) {
        return article.name !== '' &&
               article.title !== '' &&
               article.isoPubtime !== '';
      },
      newArticle: function() {
        const article = new Article();
        this.ghBlog.articles.unshift(article);
        this.curArticle = article;
      },
      selectArticle: function(article) {
        this.curArticle = article;
        if(article.source === undefined)
          this.ghBlog.loadArticle(article);
      },
      saveAll: function() {
        if(this.saving)
          throw new TypeError('Save when saving');
        this.closeMsgs();

        const modifieds = this.getModifiedArticles();
        const modifiedCnt = modifieds.length;
        const orzed = modifieds.find(o => !this.checkInfo(o));
        if(orzed !== undefined) {
          this.curArticle = orzed;
          window.alert('Missing some required properties');
          return;
        } else if(modifiedCnt === 0) {
          window.alert('Nothing changed');
          return;
        } else if(!confirm(`Save ${modifiedCnt} articles?`))
          return;

        this.saving = true;

        function marker(article) {
          const source = article.source;
          const match = /^([\s\S]*?)--+more--+([\s\S]*)$/.exec(source);
          article.renderedBrief = match ? marked(match[1]) : '';
          article.rendered = marked(match ? match[1] + match[2] : source);
          return article;
        }
        this.ghBlog.saveArticles(marker, 'Save')
            .then(() => this.showSaveMsg = true)
            .catch(err => {
              console.error(err);
              this.errorMsg = `Failed!\n${err.message}`;
              this.showErrorMsg = true;
            })
            .then(() => this.saving = false);
      },
      closeMsgs: function() {
        this.showErrorMsg = this.showSaveMsg = false;
      },
      getModifiedArticles: function() {
        return this.ghBlog.articles.filter(o => o.changed);;
      },
    },
  });

  Vue.component('articleEditor', {
    template: '#templ-article-editor',
    props: {
      article:  { default: null, validator: v => v === null || v instanceof Article },
      readonly: { type: Boolean, default: false },
      disabled: { type: Boolean, default: false },
    },
    computed: {
      isDisabled: function() {
        return this.disabled || !this.article;
      },
      sourceLoading: function() {
        return this.article && this.article.source === undefined;
      },
      resetDisabled: function() {
        return this.article && !this.article.resetable;
      },
      strTags: {
        get: function() {
          return this.article ? this.article.tags.join(' ') : '';
        },
        set: function(newVal) {
          if(this.article) {
            const s = newVal.trim();
            this.article.tags = (s ? s.split(/\s+/) : []);
          }
        },
      },
      name: {
        get: function() { this.revalidate(); return this.article ? this.article.name : ' '; },
        set: function(newVal) { if(this.article) this.article.name = newVal; },
      },
      title: {
        get: function() { this.revalidate(); return this.article ? this.article.title : ''; },
        set: function(newVal) { if(this.article) this.article.title = newVal; },
      },
      isoPubtime: {
        get: function() { this.revalidate(); return this.article ? this.article.isoPubtime : ''; },
        set: function(newVal) { if(this.article) this.article.isoPubtime = newVal; },
      },
      source: {
        get: function() { this.revalidate(); return this.article ? this.article.source : ''; },
        set: function(newVal) { if(this.article) this.article.source = newVal; },
      },
    },
    methods: {
      revalidate: function() {
        this.$nextTick(() => this.$validator.validateAll());
      },
      reset: function() {
        if(this.article && this.article.changed &&
           confirm('Discard all modifications of this article?'))
          this.article.reset();
      },
      onInput: function(prop, value) {
        if(this.article)
          this.article[prop] = value;
      },
    },
  });

  Vue.component('md-editor', {
    template: '#templ-md-editor',
    props: {
      value: String,
      readonly: Boolean,
      disabled: Boolean,
    },
    data: function() {
      return {
        renderedShown: '', // delayed show
      };
    },
    computed: {
      rendered: function() {
        return marked(this.value || '');
      },
    },
    watch: {
      rendered: _.debounce(function() {
        this.renderedShown = this.rendered;
      }, 500, { leading: true }),
    },
  });

  Vue.component('float-alert', {
    template: '#templ-float-alert',
    props: {
      show:     { type: Boolean, default: true },
      closable: { type: Boolean, default: false },
      duration: { type: Number,  default: 0 },
      width:    { type: String,  required: true },
    },
    data: function() {
      return {
        timerID: undefined,
      };
    },
    methods: {
      close: function() {
        this.removeTimer();
        this.$emit('update:show', false);
      },
      removeTimer: function() {
        clearTimeout(this.timerID);
        this.timerID = undefined;
      },
    },
    watch: {
      show: {
        handler: function(newVal) {
          if(!newVal)
            this.removeTimer();
          else if(this.duration > 0)
            this.timerID = setTimeout(() => this.close(), this.duration);
        },
        immediate: true,
      },
    },
  });

  window.root = new Vue({
    el: '#app',
    data: {
      ghBlog: null,
      loginInfo: {
        username: '',
        repo: '',
        branch: 'master',
      },
    },
    methods: {
      loginSuccess: function(ghBlog) {
        this.ghBlog = ghBlog;
      },
    },
  });

})();
