(function () {
  'use strict';

  /**
   * Create a new postgres cluster and prime it to the point of being able
   * to receive import of xtuple databases.
   */
  var cluster = exports;

  var task = require('../../lib/task'),
    pgcli = require('../../lib/pg-cli'),
    exec = require('execSync').exec,
    path = require('path'),
    _ = require('underscore'),
    knex;

  _.extend(cluster, task, /** @exports cluster */ {

    /** @override */
    beforeInstall: function (options) {
      var exists = _.findWhere(pgcli.lsclusters(), {
        name: options.xt.name,
        version: parseFloat(options.pg.version)
      });

      if (exists) {
        throw new Error('cluster configuration already exists');
      }

      options.pg.configdir = path.resolve('/etc/postgresql', options.pg.version, options.xt.name);
    },

    /** @override */
    doTask: function (options) {
      _.extend(options.pg.cluster, pgcli.createcluster(options), { name: options.xt.name });
      pgcli.ctlcluster({ action: 'restart', version: options.pg.version, name: options.xt.name });

      cluster.initCluster(options);
      pgcli.ctlcluster({ action: 'reload', version: options.pg.version, name: options.xt.name });
    },

    /** @override */
    uninstall: function (options) {
      pgcli.dropcluster({ name: options.xt.name, version: options.pg.version });
    },

    /**
     * Setup an existing, empty-ish cluster to receive xtuple.
     */
    initCluster: function (options) {
      pgcli.createdb(_.extend({ dbname: options.xt.name, owner: options.xt.name }, options));

      // Docs: <http://www.postgresql.org/docs/9.3/static/sql-createrole.html>
      var queries = [
          // create xtrole
          'CREATE ROLE xtrole',

          // create 'admin' user (default xtuple client admin)
          'CREATE ROLE admin WITH LOGIN PASSWORD \'{xt.adminpw}\' SUPERUSER'
            .format(options),

          // create 'postgres' and 'root' roles for convenience
          'CREATE ROLE postgres LOGIN SUPERUSER',

          'GRANT xtrole TO admin'
        ],
        results = _.map(queries, _.partial(pgcli.psql, options)),
        failed = _.difference(results, _.where(results, { code: 0 }));

      if (failed.length > 0) {
        throw new Error(JSON.stringify(failed, null, 2));
      }
    }
  });

})();
