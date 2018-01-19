(function() {
  'use strict';

  Vue.component('loginPage', {
    template: '#templ-login-page',
    data: function() {
      return {
        username: '',
        password: '',
        repo: '',
        branch: 'master',
        logining: false,
        errorMsg: null,
      };
    },
    methods: {
      login: function() {
        if(this.logining)
          throw new TypeError('Double login');
        this.logining = true;
        this.errorMsg = null;

        let loginCfg = {
          username: this.username,
          password: this.password,
          repo: this.repo,
          branch: this.branch,
        };
        GhBlog.load(loginCfg)
              .then(ghBlog => {
                if(!ghBlog.available)
                  throw new Error('Not initialized by simple-pages');
                this.$emit('success', ghBlog);
              })
              .catch(err => {
                this.errorMsg = err.message;
                console.error(err);
              })
              .then(() => this.logining = false);
      },
    },
  });

  Vue.component('mainPage', {
    template: '#templ-main-page',
    props: {
      ghBlogIn: GhBlog,
    },
    data: function() {
      return {
        ghBlog: this.ghBlogIn,
        curArticle: {
          name: '',
          title: '',
          isoPubtime: '',
          tags: '', // String
          source: '',
        },
        waiting: false,
        errorMsg: null,
      };
    },
    methods: {
      saveCurrentArticle: function() {
        if(this.waiting)
          throw new TypeError('Save when waiting');
        this.waiting = true;
        this.errorMsg = null;

        let source = this.curArticle.source;
        let match = /^([\s\S]*?)--+more--+([\s\S]*)$/.exec(source);
        let article = Object.assign({}, this.curArticle);
        article.tags = article.tags.split(/\s+/);
        article.renderedBrief = match ? marked(match[1]) : '';
        article.rendered = marked(match ? match[1] + match[2] : source);
        this.ghBlog.writeArticle(article, 'Save')
            .then(() => {
              this.waiting = false;
              window.alert('Saved!')
            })
            .catch(err => {
              this.waiting = false;
              this.errorMsg = err;
            });
      },
      loadArticle: function() {
        if(this.waiting)
          throw new TypeError('Load when waiting');
        this.waiting = true;
        this.errorMsg = null;
        this.ghBlog.readArticle(this.curArticle.name)
            .then(article => {
              if(article === null)
                throw new Error('Article not found');
              article.tags = article.tags.join(' ');
              this.curArticle = article;
            })
            .catch(err => this.errorMsg = err.message)
            .then(() => this.waiting = false);
      },
    },
  });

  Vue.component('md-editor', {
    template: '#templ-md-editor',
    props: {
      'value': String,
      'readonly': Boolean,
      'disabled': Boolean,
    },
    data: function() {
      return {
        renderedShown: '', // delayed show
      };
    },
    computed: {
      source: {
        get: function() {
          return this.value;
        },
        set: function(newSource) {
          this.$emit('input', newSource);
        },
      },
      rendered: function() {
        return marked(this.source);
      },
    },
    watch: {
      rendered: _.debounce(function() {
        this.renderedShown = this.rendered;
      }, 500, { leading: true }),
    },
  });

  window.root = new Vue({
    el: '#app',
    data: {
      ghBlog: null,
    },
    methods: {
      loginSuccess: function(ghBlog) {
        this.ghBlog = ghBlog;
      },
    },
  });

})();
