'use strict';

var Backbone = require('backbone');
var Spice = require('./support/spice');
var SpiceControl = require('./support/spice-control');

describe("SpiceControl", function () {
  beforeEach(function () {
    this.modelUrl = 'theUrl';
    this.Model = Backbone.Model.extend({ url: this.modelUrl });
  });

  describe("construction", function () {
    beforeEach(function () {
      this.backend = this.sinon.stub();
      this.options = {
        backend: this.backend
      };
      this.initializeSpy = this.sinon.spy(SpiceControl.prototype, 'initialize');
      this.spiceControl = new SpiceControl(this.options);
    });

    it("should create a SpiceControl", function () {
      expect(this.spiceControl).to.be.instanceOf(SpiceControl);
    });

    it("should assign the provided backend", function () {
      expect(this.spiceControl.backend).to.equal(this.backend);
    });

    it("should call initialize with the provided options", function () {
      expect(this.initializeSpy).to.have.been.calledOnce
        .and.calledOn(this.spiceControl)
        .and.calledWith(this.options);
    });
  });

  describe("generateKey", function () {
    beforeEach(function () {
      this.model = new this.Model();
      this.spiceControl = new SpiceControl();
      this.key = this.spiceControl.generateKey(this.model);
    });

    it("should return the result of the url, by default", function () {
      expect(this.key).to.equal(this.modelUrl);
    });
  });

  describe("invalidate", function () {
    beforeEach(function () {
      var spec = this;
      this.Model = Backbone.Model.extend({
        url: function () {
          return spec.modelUrl;
        }
      });
      this.model = new this.Model();

      this.spiceControl = new SpiceControl();
      this.sinon.spy(this.spiceControl, 'generateKey');
      this.sinon.stub(this.localStorage, 'removeItem');

      this.method = 'read';
      this.spiceControl.invalidate(this.model, this.method);
    });

    it("calls generateKey with the provided method", function () {
      expect(this.spiceControl.generateKey).to.have.been.calledOnce
        .and.calledWith(this.model, this.method);
    });

    it("removes the key returned from generateKey from the backend", function () {
      expect(this.localStorage.removeItem).to.have.been.calledOnce
        .and.calledWith(this.modelUrl);
    });
  });

  describe("sync", function () {
    beforeEach(function () {
      var spec = this;
      this.model = new this.Model();
      this.serverResponse = { myResponse: true };
      this.storedResponse = JSON.stringify({ data: this.serverResponse });
      this.ajax = Spice.deferred();

      this.syncResponse = this.ajax.promise.then(function () {
        spec.ajaxOptions.success(spec.serverResponse);
      });

      this.sinon.stub(Backbone, 'ajax', function (options) {
        spec.ajaxOptions = options;
        return spec.syncResponse;
      });

      this.success = this.sinon.stub();
      this.options = { success: this.success };
      this.expectedEvent = 'cache:update:' + this.modelUrl;
      this.placeholder = JSON.stringify({ placeholder: true });
      this.spiceControl = new SpiceControl({ store: this.model });
      this.sinon.spy(this.spiceControl, 'onRead');
      this.sinon.spy(this.spiceControl, 'trigger');
      this.sinon.spy(this.model, 'sync');
    });

    describe("method: read", function () {
      it("calls onRead with the model and the options", function () {
        this.spiceControl.sync('read', this.model, this.options);
        expect(this.spiceControl.onRead).to.have.been.calledOnce
          .and.calledWith(this.model, this.options);
      });

      it("reads the key from the cache", function () {
        this.sinon.stub(this.localStorage, 'getItem').returns(null);
        this.spiceControl.sync('read', this.model, this.options);
        expect(this.localStorage.getItem).to.have.been.calledOnce
          .and.calledWith(this.spiceControl.generateKey(this.model, 'read'));
      });

      describe("on a cache miss", function () {
        beforeEach(function () {
          this.sinon.stub(this.localStorage, 'getItem').returns(null);
          this.sinon.stub(this.localStorage, 'setItem');
          this.syncReturn = this.spiceControl.sync('read', this.model, this.options);
        });

        it("calls the underlying model's sync with the same arguments", function () {
          expect(this.model.sync).to.have.been.calledOnce
            .and.calledWith('read', this.model, this.options);
        });

        it("inserts a placeholder entry for the key", function () {
          expect(this.localStorage.setItem).to.have.been
            .calledWith(this.modelUrl, this.placeholder);
        });

        describe("when the sync resolves", function () {
          var spec;

          beforeEach(function () {
            spec = this;
            this.ajax.resolve();
          });

          it("calls the provided success method", function (done) {
            this.syncResponse.then(function () {
              expect(spec.success).to.have.been.calledOnce
                .and.calledWith(spec.serverResponse);
              done();
            });
          });

          it("writes to the cache", function (done) {
            this.syncResponse.then(function () {
              expect(spec.localStorage.setItem).to.have.been
                .calledWith(spec.modelUrl, spec.storedResponse);
              done();
            });
          });

          it("triggers a cache:update:[key] event with the response", function (done) {
            this.syncResponse.then(function () {
              expect(spec.spiceControl.trigger).to.have.been
                .calledWith(spec.expectedEvent, spec.serverResponse);
              done();
            });
          });
        });
      });

      describe("on a cache hit", function () {
        describe("when the cache contains data", function () {
          beforeEach(function () {
            this.sinon.stub(this.localStorage, 'getItem')
              .withArgs(this.modelUrl).returns(this.storedResponse);
            this.cacheHitRead = this.spiceControl.sync('read', this.model, this.options);
          });

          it("calls the provided success function with the response", function (done) {
            var spec = this;
            this.cacheHitRead.then(function () {
              expect(spec.success).to.have.been.calledOnce
                .and.calledWith(spec.serverResponse);
              done();
            });
          });
        });

        describe("when the cache contains a placeholder", function () {
          beforeEach(function () {
            this.sinon.stub(this.localStorage, 'getItem')
              .withArgs(this.modelUrl).returns(this.placeholder);
            this.cacheHitRead = this.spiceControl.sync('read', this.model, this.options);
          });

          it("does not call the provided success method", function () {
            expect(this.success).not.to.have.been.called;
          });

          it("calls the success method when the promise resolves", function (done) {
            var spec = this;
            this.spiceControl.trigger(this.expectedEvent, this.serverResponse);
            this.cacheHitRead.then(function () {
              expect(spec.success).to.have.been.calledOnce
                .and.calledWith(spec.serverResponse);
              done();
            });
          });
        });
      });
    });
  });
});